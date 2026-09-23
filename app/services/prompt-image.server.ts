import { PromptAdminError } from "./prompt-admin.server";
import { isImageUnavailable, retireUnboundImageKey } from "./image-reference.server";
import { cleanupImageKeys, headImages, imageKeys } from "./image-upload.server";

export async function replacePromptImage(db: D1Database, bucket: R2Bucket, id: number, form: FormData) {
  const intents = form.getAll("_intent");
  if (intents.length !== 1 || intents[0] !== "replace_image")
    throw new PromptAdminError(400, "invalid");
  const references = form.getAll("upload_reference");
  if (references.length !== 1 || typeof references[0] !== "string")
    throw new PromptAdminError(400, "invalid");
  const reference = references[0];
  const newKeys = imageKeys(reference);
  try {
    const current = await db.prepare(`SELECT original_image_key, preview_image_key, deleted_at
      FROM prompts WHERE id = ?`).bind(id).first<{
        original_image_key: string; preview_image_key: string; deleted_at: string | null;
      }>();
    if (!current) throw new PromptAdminError(404, "missing");
    if (current.deleted_at) throw new PromptAdminError(409, "deleted");
    if (await isImageUnavailable(db, newKeys.original)) throw new PromptAdminError(409, "conflict");
    const oldShared = !!await db.prepare(`SELECT 1 FROM prompts WHERE id <> ?
      AND (original_image_key IN (?, ?) OR preview_image_key IN (?, ?))`)
      .bind(id, current.original_image_key, current.preview_image_key,
        current.original_image_key, current.preview_image_key).first();
    const images = await headImages(bucket, reference);
    const now = new Date().toISOString();
    try {
      await db.batch([
        db.prepare(`SELECT CASE WHEN EXISTS (
          SELECT 1 FROM prompts WHERE id = ? AND deleted_at IS NULL
            AND original_image_key = ? AND preview_image_key = ?
        ) AND NOT EXISTS (SELECT 1 FROM prompts WHERE original_image_key = ?)
          AND NOT EXISTS (SELECT 1 FROM retired_image_keys WHERE original_image_key = ?)
        THEN 1 ELSE json('invalid') END`)
          .bind(id, current.original_image_key, current.preview_image_key, newKeys.original, newKeys.original),
        db.prepare(`UPDATE prompts SET original_image_key = ?, preview_image_key = ?,
          original_content_type = ?, original_width = ?, original_height = ?,
          preview_width = ?, preview_height = ?, original_size_bytes = ?,
          preview_size_bytes = ?, updated_at = ? WHERE id = ?`)
          .bind(newKeys.original, newKeys.preview, images.mime, images.original.width,
            images.original.height, images.preview.width, images.preview.height,
            images.original.size, images.preview.size, now, id),
        db.prepare("INSERT OR IGNORE INTO retired_image_keys (original_image_key, retired_at) VALUES (?, ?)")
          .bind(current.original_image_key, now),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("malformed JSON") || message.includes("UNIQUE constraint failed"))
        throw new PromptAdminError(409, "conflict");
      throw error;
    }
    // Explicit historical keys may not follow the current reference format.
    if (!oldShared)
      await cleanupImageKeys(bucket, [current.original_image_key, current.preview_image_key]
        .filter((key) => key !== newKeys.original && key !== newKeys.preview), "replace_old");
  } catch (error) {
    // A concurrent create/replace may have won this reference. Never delete bound objects.
    try {
      if (await retireUnboundImageKey(db, newKeys.original))
        await cleanupImageKeys(bucket, [newKeys.original, newKeys.preview], "replace_compensation");
    } catch (checkError) {
      console.error("Could not check image binding after replace failure", {
        reference, error: checkError instanceof Error ? checkError.name : "unknown",
      });
    }
    throw error;
  }
}