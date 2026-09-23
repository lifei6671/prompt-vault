import type { Locale } from "../lib/localization";
import { PAGE_SIZE, type ExploreFilters } from "../lib/explore";

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

type CategoryOption = { slug: string; name: string };
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

  if (filters.category) {
    conditions.push("c.slug = ?");
    values.push(filters.category);
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

  const [cards, categories, models, ratios] = await Promise.all([
    db.prepare(`SELECT ${cardColumns}
      ${from}
      LEFT JOIN category_translations ct ON ct.category_id = c.id
        AND ct.locale = ? AND c.source_language <> ?
      ${where}
      ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`)
      .bind(locale, locale, ...values, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all<PromptCardData>(),
    db.prepare(`SELECT c.slug, COALESCE(ct.name, c.name) AS name
      FROM categories c JOIN prompts p ON p.category_id = c.id
      LEFT JOIN category_translations ct ON ct.category_id = c.id
        AND ct.locale = ? AND c.source_language <> ?
      WHERE p.status = 'published' AND p.deleted_at IS NULL
      GROUP BY c.id ORDER BY c.sort_order, c.name`)
      .bind(locale, locale).all<CategoryOption>(),
    db.prepare(`SELECT DISTINCT model FROM prompts
      WHERE status = 'published' AND deleted_at IS NULL AND model IS NOT NULL
      ORDER BY model`).all<{ model: string }>(),
    db.prepare(`SELECT DISTINCT ratio FROM prompts
      WHERE status = 'published' AND deleted_at IS NULL AND ratio IS NOT NULL
      ORDER BY ratio`).all<{ ratio: string }>(),
  ]);

  return {
    cards: cards.results,
    total,
    totalPages,
    categories: categories.results,
    models: models.results.map((row) => row.model),
    ratios: ratios.results.map((row) => row.ratio),
  };
}

export async function listTaxonomyPrompts(
  db: D1Database, kind: TaxonomyKind, slug: string, locale: Locale, page: number,
) {
  const identity = kind === "category"
    ? await db.prepare(`SELECT c.id, c.slug, c.source_language, c.name AS source_name,
        c.description AS source_description, ct.name AS translated_name,
        ct.description AS translated_description
      FROM categories c LEFT JOIN category_translations ct
        ON ct.category_id = c.id AND ct.locale = ? AND ct.locale <> c.source_language
      WHERE c.slug = ?`).bind(locale, slug).first<{
        id: number; slug: string; source_language: Locale; source_name: string; source_description: string | null;
        translated_name: string | null; translated_description: string | null;
      }>()
    : await db.prepare(`SELECT t.id, t.slug, t.source_language, t.name AS source_name,
        NULL AS source_description, tt.name AS translated_name,
        NULL AS translated_description
      FROM tags t LEFT JOIN tag_translations tt
        ON tt.tag_id = t.id AND tt.locale = ? AND tt.locale <> t.source_language
      WHERE t.slug = ?`).bind(locale, slug).first<{
        id: number; slug: string; source_language: Locale; source_name: string; source_description: null;
        translated_name: string | null; translated_description: null;
      }>();
  if (!identity) throw new Response("Not Found", { status: 404 });

  const translated = identity.translated_name !== null;
  const name = translated ? identity.translated_name! : identity.source_name;
  const description = translated ? identity.translated_description : identity.source_description;
  const scopeJoin = kind === "tag" ? "JOIN prompt_tags ptag ON ptag.prompt_id = p.id" : "";
  const scopeWhere = kind === "tag" ? "ptag.tag_id = ?" : "p.category_id = ?";
  const from = `FROM prompts p ${scopeJoin}`;
  const where = `WHERE ${scopeWhere} AND p.status = 'published' AND p.deleted_at IS NULL`;
  const count = await db.prepare(`SELECT COUNT(*) AS total ${from} ${where}`)
    .bind(identity.id).first<{ total: number }>();
  const total = count?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (page > 1 && page > totalPages) throw new Response("Not Found", { status: 404 });

  const cards = await db.prepare(`SELECT ${cardColumns}
    ${from} JOIN categories c ON c.id = p.category_id
    LEFT JOIN category_translations ct ON ct.category_id = c.id
      AND ct.locale = ? AND ct.locale <> c.source_language
    ${where}
    ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .bind(locale, identity.id, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<PromptCardData>();

  return {
    slug: identity.slug, name, description, contentLanguage: translated ? locale : identity.source_language,
    cards: cards.results, total, totalPages,
  };
}
