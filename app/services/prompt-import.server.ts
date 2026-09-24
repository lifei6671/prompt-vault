import type { Locale } from "../lib/localization";
import { detectRatio, parsePromptImport, stableHash, stableSlug } from "../lib/prompt-import";
import { parseReferenceImageRequirement, parseVariables, validateTokens, PromptAdminError } from "./prompt-admin.server";
import { headImages } from "./image-upload.server";
import { createAdminPrompt } from "./prompt-create.server";

type Kind = "category" | "tag";
const table = { category: "categories", tag: "tags" } as const;
const translations = { category: "category_translations", tag: "tag_translations" } as const;
const foreignKey = { category: "category_id", tag: "tag_id" } as const;

function value(form: FormData, key: string, max: number): string {
  const values = form.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string" || values[0].trim().length > max)
    throw new PromptAdminError(400, "invalid");
  return values[0].trim();
}

export async function findTaxonomy(db: D1Database, kind: Kind, name: string): Promise<number | null> {
  const result = await db.prepare("SELECT id FROM " + table[kind] + " WHERE name = ? OR id IN " +
    "(SELECT " + foreignKey[kind] + " FROM " + translations[kind] + " WHERE name = ?) ORDER BY id LIMIT 1")
    .bind(name, name).first<{ id: number }>();
  return result?.id ?? null;
}

export async function ensureTaxonomy(db: D1Database, kind: Kind, name: string, source: Locale): Promise<number> {
  if (!name || name.length > 120) throw new PromptAdminError(400, "invalid");
  const existing = await findTaxonomy(db, kind, name);
  if (existing) return existing;
  const base = stableSlug(name, kind);
  let slug = base;
  const conflicting = await db.prepare("SELECT name FROM " + table[kind] + " WHERE slug = ?").bind(base).first<{ name: string }>();
  if (conflicting && conflicting.name !== name) slug = base.slice(0, 71).replace(/-$/, "") + "-" + stableHash(name);
  const now = new Date().toISOString();
  const sql = kind === "category"
    ? "INSERT OR IGNORE INTO categories (slug, source_language, name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, NULL, 0, ?, ?)"
    : "INSERT OR IGNORE INTO tags (slug, source_language, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
  await db.prepare(sql).bind(slug, source, name, now, now).run();
  const created = await findTaxonomy(db, kind, name);
  if (!created) throw new PromptAdminError(409, "conflict");
  return created;
}

export async function createImportedPrompt(db: D1Database, bucket: R2Bucket, input: FormData): Promise<number> {
  const document = value(input, "import_document", 100_000);
  const reference = value(input, "upload_reference", 300);
  const images = await headImages(bucket, reference);
  const parsed = parsePromptImport(document, detectRatio(images.original.width, images.original.height));
  const advanced = input.get("_mode") === "import_advanced";
  if (input.get("_mode") !== "import" && !advanced) throw new PromptAdminError(400, "invalid");
  if (!advanced && parsed.errors.length) throw new PromptAdminError(400, "invalid");

  const source = advanced ? value(input, "source_language", 5) : parsed.sourceLanguage;
  if (source !== "zh-CN" && source !== "en-US") throw new PromptAdminError(400, "invalid");
  const category = advanced ? value(input, "category_name", 120) : parsed.category;
  const tags = advanced ? value(input, "tag_names", 2000).split(",").map((tag) => tag.trim()).filter(Boolean) : parsed.tags;
  if (!category || tags.length > 100 || tags.some((tag) => tag.length > 120))
    throw new PromptAdminError(400, "invalid");
  const template = advanced ? value(input, "prompt_template", 50_000) : parsed.promptTemplate;
  const variables = advanced ? value(input, "variables_json", 100_000) : JSON.stringify(parsed.variables);
  const parsedVariables = parseVariables(variables, source);
  validateTokens(template, null, parsedVariables);

  const categoryId = await ensureTaxonomy(db, "category", category, source);
  const tagIds = [];
  for (const tag of new Set(tags)) tagIds.push(await ensureTaxonomy(db, "tag", tag, source));

  const form = new FormData();
  form.set("upload_reference", reference);
  form.set("source_language", source);
  for (const key of ["slug", "title", "description", "prompt_template", "image_alt", "model", "ratio"]) {
    const defaults: Record<string, string> = {
      slug: parsed.slug, title: parsed.title, description: "", prompt_template: parsed.promptTemplate,
      image_alt: parsed.imageAlt, model: parsed.model, ratio: parsed.ratio,
    };
    form.set(key, advanced ? value(input, key, key === "prompt_template" ? 50_000 : 2000) : defaults[key]);
  }
  if (advanced ? parseReferenceImageRequirement(input) : parsed.requiresReferenceImage)
    form.set("requires_reference_image", "1");
  form.set("category_id", String(categoryId));
  tagIds.forEach((id) => form.append("tag_ids", String(id)));
  form.set("translation_locale", source === "zh-CN" ? "en-US" : "zh-CN");
  form.set("translation_mode", advanced ? value(input, "translation_mode", 10) : "remove");
  for (const key of ["translation_title", "translation_description", "translation_prompt_template", "translation_image_alt"]) {
    form.set(key, advanced ? value(input, key, 50_000) : "");
  }
  form.set("variables_json", variables);
  return createAdminPrompt(db, bucket, form);
}
