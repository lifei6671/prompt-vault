import type { Locale } from "../lib/localization";

export type TaxonomyKind = "category" | "tag";
export type TaxonomyRow = {
  id: number; slug: string; source_language: Locale; name: string;
  description: string | null; sort_order: number;
  translation_name: string | null; translation_description: string | null;
  prompt_count: number; updated_at: string;
};

export class TaxonomyAdminError extends Error {
  constructor(public status: 400 | 404 | 409, public code: "invalid" | "missing" | "duplicate" | "referenced") {
    super(code);
  }
}

const config = {
  category: { table: "categories", translations: "category_translations", foreignKey: "category_id", references: "prompts" },
  tag: { table: "tags", translations: "tag_translations", foreignKey: "tag_id", references: "prompt_tags" },
} as const;

function invalid(): never { throw new TaxonomyAdminError(400, "invalid"); }

function field(form: FormData, key: string): string {
  const values = form.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") invalid();
  return values[0];
}

function limited(form: FormData, key: string, max: number, required = false): string {
  const value = field(form, key).trim();
  if (value.length > max || (required && !value)) invalid();
  return value;
}

function idField(form: FormData): number {
  const raw = field(form, "id");
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) invalid();
  return Number(raw);
}

function sourceLanguage(form: FormData): Locale {
  const value = field(form, "source_language");
  if (value !== "zh-CN" && value !== "en-US") invalid();
  return value;
}

function translationLanguage(form: FormData, source: Locale): Locale {
  const value = field(form, "translation_locale");
  if ((value !== "zh-CN" && value !== "en-US") || value === source) invalid();
  return value;
}

function otherLocale(locale: Locale): Locale {
  return locale === "zh-CN" ? "en-US" : "zh-CN";
}

function content(form: FormData, kind: TaxonomyKind, translationLocale: Locale) {
  const name = limited(form, "name", 120, true);
  const description = kind === "category" ? limited(form, "description", 1000) || null : null;

  const translationName = limited(form, "translation_name", 120);
  const translationDescription = kind === "category"
    ? limited(form, "translation_description", 1000) || null : null;

  let sortOrder = 0;
  if (kind === "category") {
    const raw = field(form, "sort_order");
    if (!/^-?(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw)) ||
      Math.abs(Number(raw)) > 1_000_000) invalid();
    sortOrder = Number(raw);
  }
  return { name, description, sortOrder, translationLocale, translationName, translationDescription };
}

function mapWriteError(error: unknown, kind: TaxonomyKind): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(`UNIQUE constraint failed: ${config[kind].table}.slug`)) {
    throw new TaxonomyAdminError(409, "duplicate");
  }
  throw error;
}

export async function listTaxonomyAdmin(db: D1Database, kind: TaxonomyKind): Promise<TaxonomyRow[]> {
  const { table, translations, foreignKey } = config[kind];
  const rows = await db.prepare(`SELECT parent.id, parent.slug, parent.source_language, parent.updated_at,
    parent.name, ${kind === "category" ? "parent.description, parent.sort_order," : "NULL AS description, 0 AS sort_order,"}
    translation.name AS translation_name,
    ${kind === "category" ? "translation.description" : "NULL"} AS translation_description,
    COALESCE(usage.prompt_count, 0) AS prompt_count
    FROM ${table} parent LEFT JOIN ${translations} translation
      ON translation.${foreignKey} = parent.id AND translation.locale <> parent.source_language
    LEFT JOIN (${kind === "category"
      ? "SELECT category_id AS taxonomy_id, COUNT(*) AS prompt_count FROM prompts GROUP BY category_id"
      : "SELECT pt.tag_id AS taxonomy_id, COUNT(*) AS prompt_count FROM prompt_tags pt GROUP BY pt.tag_id"}) usage
      ON usage.taxonomy_id = parent.id
    ORDER BY ${kind === "category" ? "parent.sort_order, " : ""}parent.name, parent.id`)
    .all<TaxonomyRow>();
  return rows.results;
}

export async function mutateTaxonomyAdmin(db: D1Database, kind: TaxonomyKind, form: FormData): Promise<void> {
  const intent = field(form, "_intent");
  if (intent !== "create" && intent !== "update" && intent !== "delete") invalid();
  const { table, translations, foreignKey, references } = config[kind];

  if (intent === "delete") {
    const id = idField(form);
    if (form.has("slug") || form.has("source_language") || form.has("translation_locale")) invalid();
    const result = await db.prepare(`DELETE FROM ${table} WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM ${references} WHERE ${foreignKey} = ?)`)
      .bind(id, id).run();
    if (result.meta.changes) return;
    const exists = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(id).first();
    throw new TaxonomyAdminError(exists ? 409 : 404, exists ? "referenced" : "missing");
  }

  if (intent === "create") {
    if (form.has("id") || form.has("translation_locale")) invalid();
    const slug = limited(form, "slug", 80, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) invalid();
    const source = sourceLanguage(form);
    const values = content(form, kind, otherLocale(source));
    const now = new Date().toISOString();
    const parent = kind === "category"
      ? db.prepare(`INSERT INTO categories
        (slug, source_language, name, description, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(slug, source, values.name, values.description,
        values.sortOrder, now, now)
      : db.prepare(`INSERT INTO tags (slug, source_language, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`).bind(slug, source, values.name, now, now);
    const statements = [parent];
    if (values.translationName) {
      statements.push(kind === "category"
        ? db.prepare(`INSERT INTO category_translations (category_id, locale, name, description)
          VALUES ((SELECT id FROM categories WHERE slug = ?), ?, ?, ?)`)
          .bind(slug, values.translationLocale, values.translationName, values.translationDescription)
        : db.prepare(`INSERT INTO tag_translations (tag_id, locale, name)
          VALUES ((SELECT id FROM tags WHERE slug = ?), ?, ?)`)
          .bind(slug, values.translationLocale, values.translationName));
    }
    try { await db.batch(statements); } catch (error) { mapWriteError(error, kind); }
    return;
  }

  if (form.has("slug") || form.has("source_language")) invalid();
  const id = idField(form);
  const row = await db.prepare(`SELECT source_language FROM ${table} WHERE id = ?`)
    .bind(id).first<{ source_language: Locale }>();
  if (!row) throw new TaxonomyAdminError(404, "missing");
  const values = content(form, kind, translationLanguage(form, row.source_language));
  const now = new Date().toISOString();
  const parent = kind === "category"
    ? db.prepare(`UPDATE categories SET name = ?, description = ?, sort_order = ?, updated_at = ?
      WHERE id = ?`).bind(values.name, values.description, values.sortOrder, now, id)
    : db.prepare(`UPDATE tags SET name = ?, updated_at = ? WHERE id = ?`)
      .bind(values.name, now, id);
  const translation = values.translationName
    ? kind === "category"
      ? db.prepare(`INSERT INTO category_translations (category_id, locale, name, description)
        VALUES (?, ?, ?, ?) ON CONFLICT(category_id, locale) DO UPDATE SET
        name = excluded.name, description = excluded.description`)
        .bind(id, values.translationLocale, values.translationName, values.translationDescription)
      : db.prepare(`INSERT INTO tag_translations (tag_id, locale, name) VALUES (?, ?, ?)
        ON CONFLICT(tag_id, locale) DO UPDATE SET name = excluded.name`)
        .bind(id, values.translationLocale, values.translationName)
    : db.prepare(`DELETE FROM ${translations} WHERE ${foreignKey} = ? AND locale = ?`)
      .bind(id, values.translationLocale);
  await db.batch([parent, translation]);
}





