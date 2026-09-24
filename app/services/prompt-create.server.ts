import type { Locale } from "../lib/localization";
import { PromptAdminError, parsePromptFields, relatedPromptStatements } from "./prompt-admin.server";
import { cleanupImages, headImages, imageKeys } from "./image-upload.server";
import { isImageUnavailable, retireUnboundImageKey } from "./image-reference.server";

function sourceLanguage(form: FormData): Locale {
  const values = form.getAll("source_language");
  if (values.length !== 1 || (values[0] !== "zh-CN" && values[0] !== "en-US"))
    throw new PromptAdminError(400, "invalid");
  return values[0];
}
function reference(form: FormData) {
  const values = form.getAll("upload_reference");
  if (values.length !== 1 || typeof values[0] !== "string")
    throw new PromptAdminError(400, "invalid");
  imageKeys(values[0]);
  return values[0];
}
export async function createAdminPrompt(db: D1Database, bucket: R2Bucket, form: FormData) {
  const source = sourceLanguage(form);
  const uploadReference = reference(form);
  const fields = await parsePromptFields(db, form, source);
  const images = await headImages(bucket, uploadReference);
  if (await isImageUnavailable(db, images.keys.original)) throw new PromptAdminError(409, "conflict");
  const random = crypto.getRandomValues(new Uint8Array(6));
  const id = random.reduce((value, byte) => value * 256 + byte, 0) + 1;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(`SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM prompts WHERE original_image_key = ?
    ) AND NOT EXISTS (SELECT 1 FROM retired_image_keys WHERE original_image_key = ?)
    THEN 1 ELSE json('invalid') END`).bind(images.keys.original, images.keys.original),
    db.prepare(`INSERT INTO prompts
      (id, slug, source_language, title, description, prompt_template, image_alt, model, ratio, requires_reference_image,
       category_id, original_image_key, preview_image_key, original_content_type,
       original_width, original_height, preview_width, preview_height,
       original_size_bytes, preview_size_bytes, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?)`)
      .bind(id, fields.slug, source, fields.title, fields.description, fields.template, fields.imageAlt,
        fields.model, fields.ratio, Number(fields.requiresReferenceImage), fields.categoryId, images.keys.original, images.keys.preview,
        images.mime, images.original.width, images.original.height, images.preview.width,
        images.preview.height, images.original.size, images.preview.size, now, now),
    ...relatedPromptStatements(db, id, now, fields),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = message.includes("UNIQUE constraint failed") ||
      message.includes("FOREIGN KEY constraint failed") || message.includes("malformed JSON");
    if (!conflict) {
      console.error("Prompt create D1 batch failed", { id,
        error: error instanceof Error ? error.name : "unknown",
        schema: /no such (column|table)|has no column named/i.test(message) });
      throw error;
    }
    // A concurrent successful create may have bound the same reference. Never remove its images.
    try {
      if (await retireUnboundImageKey(db, images.keys.original)) await cleanupImages(bucket, uploadReference);
    } catch (checkError) {
      console.error("Could not check image binding after D1 conflict", { id,
        error: checkError instanceof Error ? checkError.name : "unknown" });
    }
    throw new PromptAdminError(409, "conflict");
  }
  return id;
}
