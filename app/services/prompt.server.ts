import type { Locale } from "../lib/localization";
import { PAGE_SIZE, type ExploreFilters } from "../lib/explore";
import { loadExploreOptions } from "./explore-options.server";

export type PromptCardData = {
  slug: string;
  title: string;
  source_language: Locale;
  model: string | null;
  ratio: string | null;
  category_name: string;
  preview_image_key: string;
  preview_width: number;
  preview_height: number;
  image_alt: string;
};

export type TaxonomyKind = "category" | "tag";

const cardColumns = `p.slug, p.title, p.source_language, p.model, p.ratio,
  COALESCE(ct.name, c.name) AS category_name, p.preview_image_key,
  p.preview_width, p.preview_height, p.image_alt`;

export async function listExplorePrompts(
  db: D1Database,
  filters: ExploreFilters,
  locale: Locale,
  page: number,
) {
  const conditions = ["p.status = 'published'", "p.deleted_at IS NULL"];
  const values: string[] = [];
  if (filters.contentType === "image") conditions.push("p.original_content_type LIKE 'image/%'");
  const orderBy = filters.sort === "recommended"
    ? "c.sort_order ASC, p.published_at DESC, p.id DESC"
    : "p.published_at DESC, p.id DESC";

  if (filters.category) {
    conditions.push("c.slug = ?");
    values.push(filters.category);
  }
  if (filters.tag) {
    conditions.push("EXISTS (SELECT 1 FROM prompt_tags ptag JOIN tags t ON t.id = ptag.tag_id WHERE ptag.prompt_id = p.id AND t.slug = ?)");
    values.push(filters.tag);
  }
  if (filters.model) {
    conditions.push("p.model = ?");
    values.push(filters.model);
  }
  if (filters.ratio) {
    conditions.push("p.ratio = ?");
    values.push(filters.ratio);
  }
  if (filters.sourceLanguage) {
    conditions.push("p.source_language = ?");
    values.push(filters.sourceLanguage);
  }
  if (filters.q) {
    const term = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(`(
      p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\'
      OR p.model LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM prompt_translations pt WHERE pt.prompt_id = p.id
                 AND (pt.title LIKE ? ESCAPE '\\' OR pt.description LIKE ? ESCAPE '\\'))
      OR EXISTS (SELECT 1 FROM category_translations cs WHERE cs.category_id = c.id
                 AND cs.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM prompt_tags ptag JOIN tags t ON t.id = ptag.tag_id
                 LEFT JOIN tag_translations tt ON tt.tag_id = t.id
                 WHERE ptag.prompt_id = p.id AND
                 (t.name LIKE ? ESCAPE '\\' OR tt.name LIKE ? ESCAPE '\\'))
    )`);
    values.push(...Array(9).fill(term));
  }

  const from = "FROM prompts p JOIN categories c ON c.id = p.category_id";
  const where = `WHERE ${conditions.join(" AND ")}`;
  const count = await db.prepare(`SELECT COUNT(*) AS total ${from} ${where}`)
    .bind(...values).first<{ total: number }>();
  const total = count?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (page > 1 && page > totalPages) throw new Response("Not Found", { status: 404 });

  const [cards, options] = await Promise.all([
    db.prepare(`SELECT ${cardColumns}
      ${from}
      LEFT JOIN category_translations ct ON ct.category_id = c.id
        AND ct.locale = ? AND c.source_language <> ?
      ${where}
      ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(locale, locale, ...values, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all<PromptCardData>(),
    loadExploreOptions(db, locale),
  ]);

  return {
    cards: cards.results,
    total,
    totalPages,
    ...options,
  };
}

export async function getTaxonomyIdentity(
  db: D1Database, kind: TaxonomyKind, slug: string, locale: Locale,
) {
  const identity = kind === "category"
    ? await db.prepare(`SELECT c.slug, c.source_language, c.name AS source_name,
        c.description AS source_description, ct.name AS translated_name,
        ct.description AS translated_description
      FROM categories c LEFT JOIN category_translations ct
        ON ct.category_id = c.id AND ct.locale = ? AND ct.locale <> c.source_language
      WHERE c.slug = ?`).bind(locale, slug).first<{
        slug: string; source_language: Locale; source_name: string; source_description: string | null;
        translated_name: string | null; translated_description: string | null;
      }>()
    : await db.prepare(`SELECT t.slug, t.source_language, t.name AS source_name,
        NULL AS source_description, tt.name AS translated_name,
        NULL AS translated_description
      FROM tags t LEFT JOIN tag_translations tt
        ON tt.tag_id = t.id AND tt.locale = ? AND tt.locale <> t.source_language
      WHERE t.slug = ?`).bind(locale, slug).first<{
        slug: string; source_language: Locale; source_name: string; source_description: null;
        translated_name: string | null; translated_description: null;
      }>();
  if (!identity) throw new Response("Not Found", { status: 404 });
  const translated = identity.translated_name !== null;
  return {
    slug: identity.slug,
    name: translated ? identity.translated_name! : identity.source_name,
    description: translated ? identity.translated_description : identity.source_description,
    contentLanguage: translated ? locale : identity.source_language,
  };
}
