export async function isImageBound(db: D1Database, key: string) {
  return !!await db.prepare("SELECT 1 FROM prompts WHERE original_image_key = ?").bind(key).first();
}
export async function isImageUnavailable(db: D1Database, key: string) {
  return await isImageBound(db, key) || !!await db.prepare(
    "SELECT 1 FROM retired_image_keys WHERE original_image_key = ?",
  ).bind(key).first();
}
// Tombstones and binding assertions are serialized by D1. Once retired,
// another create/replace cannot bind the key while R2 cleanup is in flight.
export async function retireUnboundImageKey(db: D1Database, key: string) {
  await db.prepare(`INSERT OR IGNORE INTO retired_image_keys (original_image_key, retired_at)
    SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM prompts WHERE original_image_key = ?)`)
    .bind(key, new Date().toISOString(), key).run();
  return !await isImageBound(db, key) && !!await db.prepare(
    "SELECT 1 FROM retired_image_keys WHERE original_image_key = ?",
  ).bind(key).first();
}