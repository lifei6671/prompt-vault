import { env } from "cloudflare:workers";
import { cleanupImageKeys } from "./image-upload.server";
import { parseSelectOptions, type Locale, type SelectOption } from "../lib/localization";
import { scanPromptKeys } from "../lib/prompt-template";

export type Variable = { key: string; type: "text" | "select"; label: string; placeholder: string | null;
  translation_label: string | null; translation_placeholder: string | null; options: SelectOption[] | null };
export type AdminPrompt = {
  id: number; slug: string; source_language: Locale; title: string; description: string | null;
  prompt_template: string; image_alt: string; model: string | null; ratio: string | null;
  category_id: number; status: "draft" | "published"; published_at: string | null;
  deleted_at: string | null; created_at: string; updated_at: string; original_image_key: string; preview_image_key: string;
  original_content_type: string; original_width: number; original_height: number;
  preview_width: number; preview_height: number; original_size_bytes: number; preview_size_bytes: number;
  translation: { locale: Locale; title: string; description: string | null; prompt_template: string; image_alt: string } | null;
  variables: Variable[]; tagIds: number[];
};
export type AdminListRow = Pick<AdminPrompt, "id" | "slug" | "title" | "status" | "model" | "ratio" |
  "published_at" | "deleted_at" | "updated_at"> & { category_name: string };
export class PromptAdminError extends Error {
  constructor(public status: 400 | 404 | 409, public code:
    "invalid" | "missing" | "conflict" | "slugFrozen" | "deleted" | "tokens") { super(code); }
}
function invalid(code: PromptAdminError["code"] = "invalid"): never { throw new PromptAdminError(400, code); }
export function parsePromptId(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) invalid();
  return Number(value);
}
function field(form: FormData, name: string, max: number, required = false): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") invalid();
  const value = values[0].trim();
  if (value.length > max || (required && !value)) invalid();
  return value;
}
function contentField(form: FormData, name: string, max: number, required = false): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") invalid();
  const value = values[0];
  if (value.length > max || (required && !value.trim())) invalid();
  return value;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== "string") invalid();
  const trimmed = value.trim();
  if (trimmed.length > max || (required && !trimmed)) invalid();
  return trimmed;
}
function optional(value: unknown, max: number): string | null {
  return value === null || value === undefined ? null : text(value, max) || null;
}
const otherLocale = (locale: Locale): Locale => locale === "zh-CN" ? "en-US" : "zh-CN";
export function parseVariables(json: string, source: Locale): Variable[] {
  if (json.length > 100_000) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { invalid(); }
  if (!Array.isArray(parsed) || parsed.length > 100) invalid();
  const seen = new Set<string>();
  return parsed.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid();
    const item = entry as Record<string, unknown>;
    const key = text(item.key, 64, true);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || seen.has(key)) invalid();
    seen.add(key);
    if (item.type !== "text" && item.type !== "select") invalid();
    const label = text(item.label, 120, true);
    const placeholder = optional(item.placeholder, 300);
    const translation_label = optional(item.translation_label, 120);
    const translation_placeholder = optional(item.translation_placeholder, 300);
    if (!translation_label && translation_placeholder) invalid();
    let options: SelectOption[] | null = null;
    if (item.type === "text") {
      if (item.options !== null) invalid();
    } else {
      try { options = parseSelectOptions(JSON.stringify(item.options), source); }
      catch { invalid(); }
    }
    return { key, type: item.type, label, placeholder, translation_label, translation_placeholder, options };
  });
}
export function validateTokens(source: string, translation: string | null, variables: Variable[]) {
  const keys = new Set(scanPromptKeys(source));
  if (keys.size !== variables.length || variables.some((item) => !keys.has(item.key))) invalid("tokens");
  if (translation !== null) {
    const translated = new Set(scanPromptKeys(translation));
    if (translated.size !== keys.size || [...keys].some((key) => !translated.has(key))) invalid("tokens");
  }
}
export async function parsePromptFields(db: D1Database, form: FormData, source: Locale) {
  const slug = field(form, "slug", 80, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) invalid();
  const title = field(form, "title", 200, true);
  const description = contentField(form, "description", 2000) || null;
  const template = contentField(form, "prompt_template", 50_000, true);
  const imageAlt = field(form, "image_alt", 500, true);
  const model = field(form, "model", 120) || null;
  const ratio = field(form, "ratio", 60) || null;
  const categoryId = parsePromptId(field(form, "category_id", 30, true));
  if (!await db.prepare("SELECT 1 FROM categories WHERE id = ?").bind(categoryId).first())
    throw new PromptAdminError(409, "conflict");
  const tagIds = [...new Set(form.getAll("tag_ids").map((value) => {
    if (typeof value !== "string") invalid();
    return parsePromptId(value);
  }))];
  if (tagIds.length) {
    const found = await db.prepare(`SELECT id FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")})`)
      .bind(...tagIds).all<{ id: number }>();
    if (found.results.length !== tagIds.length) throw new PromptAdminError(409, "conflict");
  }
  const target = otherLocale(source);
  if (field(form, "translation_locale", 5) !== target) invalid();
  const mode = field(form, "translation_mode", 10);
  if (mode !== "present" && mode !== "remove") invalid();
  const translatedTitle = field(form, "translation_title", 200);
  const translatedDescription = contentField(form, "translation_description", 2000) || null;
  const translatedTemplate = contentField(form, "translation_prompt_template", 50_000);
  const translatedAlt = field(form, "translation_image_alt", 500);
  if (mode === "present" && (!translatedTitle || !translatedTemplate || !translatedAlt)) invalid();

  const variables = parseVariables(field(form, "variables_json", 100_000), source);
  validateTokens(template, mode === "present" ? translatedTemplate : null, variables);
  return { slug, title, description, template, imageAlt, model, ratio, categoryId, tagIds, target, mode, translatedTitle, translatedDescription, translatedTemplate, translatedAlt, variables };
}
export function relatedPromptStatements(db: D1Database, id: number, now: string,
  fields: Awaited<ReturnType<typeof parsePromptFields>>): D1PreparedStatement[] {
  const { target, mode, translatedTitle, translatedDescription, translatedTemplate, translatedAlt, variables, tagIds } = fields;
  const statements: D1PreparedStatement[] = [
    mode === "present"
      ? db.prepare(`INSERT INTO prompt_translations
        (prompt_id, locale, title, description, prompt_template, image_alt)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(prompt_id, locale) DO UPDATE SET
        title = excluded.title, description = excluded.description,
        prompt_template = excluded.prompt_template, image_alt = excluded.image_alt`)
        .bind(id, target, translatedTitle, translatedDescription, translatedTemplate, translatedAlt)
      : db.prepare("DELETE FROM prompt_translations WHERE prompt_id = ? AND locale = ?").bind(id, target),
  ];
  variables.forEach((variable, index) => {
    statements.push(db.prepare(`INSERT INTO prompt_variables
      (prompt_id, variable_key, label, input_type, input_placeholder, options_json,
       sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, variable.key, variable.label, variable.type, variable.placeholder,
        variable.options === null ? null : JSON.stringify(variable.options), index, now, now));
    if (variable.translation_label) statements.push(db.prepare(`INSERT INTO prompt_variable_translations
      (variable_id, locale, label, input_placeholder)
      VALUES ((SELECT id FROM prompt_variables WHERE prompt_id = ? AND variable_key = ?), ?, ?, ?)`)
      .bind(id, variable.key, target, variable.translation_label, variable.translation_placeholder));
  });
  tagIds.forEach((tagId) => statements.push(
    db.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)").bind(id, tagId)));
  return statements;
}
export async function listAdminPrompts(db: D1Database): Promise<AdminListRow[]> {
  const rows = await db.prepare(`SELECT p.id, p.slug, p.title, p.status, p.model, p.ratio,
    p.published_at, p.deleted_at, p.updated_at, c.name AS category_name
    FROM prompts p JOIN categories c ON c.id = p.category_id ORDER BY p.updated_at DESC, p.id DESC`)
    .all<AdminListRow>();
  return rows.results;
}
export async function listPromptTaxonomy(db: D1Database) {
  const [categories, tags] = await Promise.all([
    db.prepare("SELECT id, name FROM categories ORDER BY sort_order, name, id").all<{ id: number; name: string }>(),
    db.prepare("SELECT id, name FROM tags ORDER BY name, id").all<{ id: number; name: string }>(),
  ]);
  return { categories: categories.results, tags: tags.results };
}
async function row(db: D1Database, id: number) {
  const prompt = await db.prepare(`SELECT id, slug, source_language, title, description, prompt_template,
    image_alt, model, ratio, category_id, status, published_at, deleted_at, created_at, updated_at,
    original_image_key, preview_image_key, original_content_type, original_width, original_height,
    preview_width, preview_height, original_size_bytes, preview_size_bytes FROM prompts WHERE id = ?`)
    .bind(id).first<Omit<AdminPrompt, "translation" | "variables" | "tagIds">>();
  if (!prompt) throw new PromptAdminError(404, "missing");
  return prompt;
}
export async function getAdminPrompt(db: D1Database, id: number): Promise<AdminPrompt> {
  const prompt = await row(db, id);
  const target = otherLocale(prompt.source_language);
  const [translation, variables, tags] = await Promise.all([
    db.prepare("SELECT locale, title, description, prompt_template, image_alt FROM prompt_translations WHERE prompt_id = ? AND locale = ?")
      .bind(id, target).first<NonNullable<AdminPrompt["translation"]>>(),
    db.prepare(`SELECT v.variable_key, v.label, v.input_type, v.input_placeholder, v.options_json,
      vt.label AS translated_label, vt.input_placeholder AS translated_placeholder
      FROM prompt_variables v LEFT JOIN prompt_variable_translations vt
      ON vt.variable_id = v.id AND vt.locale = ?
      WHERE v.prompt_id = ? ORDER BY v.sort_order, v.id`).bind(target, id)
      .all<{ variable_key: string; label: string; input_type: "text" | "select";
        input_placeholder: string | null; options_json: string | null;
        translated_label: string | null; translated_placeholder: string | null }>(),
    db.prepare("SELECT tag_id FROM prompt_tags WHERE prompt_id = ? ORDER BY tag_id")
      .bind(id).all<{ tag_id: number }>(),
  ]);
  const storedVariables = variables.results.map((variable) => {
    let options: unknown = variable.options_json;
    if (variable.input_type === "select") {
      try { options = JSON.parse(variable.options_json ?? "null"); } catch { invalid(); }
    }
    return {
      key: variable.variable_key, type: variable.input_type, label: variable.label,
      placeholder: variable.input_placeholder, translation_label: variable.translated_label,
      translation_placeholder: variable.translated_placeholder, options,
    };
  });
  return { ...prompt, translation, tagIds: tags.results.map((tag) => tag.tag_id),
    variables: parseVariables(JSON.stringify(storedVariables), prompt.source_language) };
}
function mapWriteError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint failed: prompts.slug") || message.includes("FOREIGN KEY constraint failed") || message.includes("malformed JSON"))
    throw new PromptAdminError(409, "conflict");
  throw error;
}
export async function mutateAdminPrompt(db: D1Database, id: number, form: FormData, bucket: R2Bucket = env.IMAGES) {
  const intent = field(form, "_intent", 20);
  if (!["save", "publish", "withdraw", "delete"].includes(intent)) invalid();
  const prompt = await row(db, id);
  if (prompt.deleted_at) throw new PromptAdminError(409, "deleted");
  const now = new Date().toISOString();
  if (intent === "delete") {
    // RETURNING captures the keys of the version actually deleted, even if a replace won first.
    const deleted = await db.prepare(`UPDATE prompts SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL RETURNING original_image_key, preview_image_key`)
      .bind(now, now, id).first<{ original_image_key: string; preview_image_key: string }>();
    if (!deleted) throw new PromptAdminError(409, "conflict");
    try {
      const shared = await db.prepare(`SELECT 1 FROM prompts WHERE id <> ? AND deleted_at IS NULL
        AND (original_image_key IN (?, ?) OR preview_image_key IN (?, ?))`)
        .bind(id, deleted.original_image_key, deleted.preview_image_key,
          deleted.original_image_key, deleted.preview_image_key).first();
      if (!shared)
        await cleanupImageKeys(bucket, [deleted.original_image_key, deleted.preview_image_key], "soft_delete");
    } catch (error) {
      // The DB deletion is already committed. A failed safety check leaves an orphan, not a broken active image.
      console.error("Could not check shared images after soft delete", {
        id, keys: [deleted.original_image_key, deleted.preview_image_key],
        error: error instanceof Error ? error.name : "unknown",
      });
    }
    return;
  }
  if (intent === "withdraw") {
    if (prompt.status !== "published") throw new PromptAdminError(409, "conflict");
    const result = await db.prepare("UPDATE prompts SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'published' AND deleted_at IS NULL")
      .bind(now, id).run();
    if (!result.meta.changes) throw new PromptAdminError(409, "conflict");
    return;
  }
  if (intent === "publish") {
    if (prompt.status !== "draft") throw new PromptAdminError(409, "conflict");
    const current = await getAdminPrompt(db, id);
    validateTokens(current.prompt_template, current.translation?.prompt_template ?? null, current.variables);
    const result = await db.prepare(`UPDATE prompts SET status = 'published', published_at = COALESCE(published_at, ?),
      updated_at = ? WHERE id = ? AND status = 'draft' AND deleted_at IS NULL`).bind(now, now, id).run();
    if (!result.meta.changes) throw new PromptAdminError(409, "conflict");
    return;
  }
  if (form.has("source_language") || form.has("original_image_key") || form.has("preview_image_key")) invalid();
  if (prompt.published_at && field(form, "slug", 80, true) !== prompt.slug)
    throw new PromptAdminError(409, "slugFrozen");
  const fields = await parsePromptFields(db, form, prompt.source_language);
  const { slug, title, description, template, imageAlt, model, ratio, categoryId } = fields;
  const statements: D1PreparedStatement[] = [
    // A failed assertion aborts the D1 batch before any related row changes.
    db.prepare(`SELECT CASE WHEN EXISTS (
      SELECT 1 FROM prompts WHERE id = ? AND slug = ? AND status = ?
        AND published_at IS ? AND deleted_at IS NULL
    ) THEN 1 ELSE json('invalid') END`).bind(id, prompt.slug, prompt.status, prompt.published_at),
    db.prepare(`UPDATE prompts SET slug = ?, title = ?, description = ?, prompt_template = ?,
      image_alt = ?, model = ?, ratio = ?, category_id = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`)
      .bind(slug, title, description, template, imageAlt, model, ratio, categoryId, now, id),
    db.prepare("DELETE FROM prompt_variables WHERE prompt_id = ?").bind(id),
    db.prepare("DELETE FROM prompt_tags WHERE prompt_id = ?").bind(id),
  ];
  statements.push(...relatedPromptStatements(db, id, now, fields));
  try { await db.batch(statements); } catch (error) { mapWriteError(error); }
}
