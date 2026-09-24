import { parseLocale, parseSelectOptions, resolveOptionLabel, type Locale } from "../lib/localization";

type PromptRow = {
  id: number; slug: string; status: "draft" | "published"; deleted_at: string | null;
  source_language: Locale; title: string; description: string | null;
  prompt_template: string; image_alt: string;
  translated_title: string | null; translated_description: string | null;
  translated_template: string | null; translated_alt: string | null;
  model: string | null; ratio: string | null; category_name: string;
  requires_reference_image: number;
  original_image_key: string; original_width: number; original_height: number;
  preview_image_key: string; preview_width: number; preview_height: number;
};
type VariableRow = {
  variable_key: string; label: string; input_placeholder: string | null;
  input_type: "text" | "select"; options_json: string | null;
  translated_label: string | null; translated_placeholder: string | null;
};
export type PromptDetail = {
  slug: string; title: string; description: string | null; promptTemplate: string;
  imageAlt: string; imageKey: string; imageWidth: number; imageHeight: number;
  previewImageKey: string; previewWidth: number; previewHeight: number;
  model: string | null; ratio: string | null; categoryName: string;
  requiresReferenceImage: boolean;
  tags: { slug: string; name: string }[];
  sourceLanguage: Locale; contentLanguage: Locale; languages: Locale[];
  variables: {
    key: string; type: "text" | "select"; label: string; placeholder: string | null;
    options: { value: string; label: string }[];
  }[];
};

export async function getPromptDetail(
  db: D1Database, slug: string, uiLocale: Locale, requestedLanguage: string | null,
): Promise<PromptDetail> {
  return loadPromptDetail(db, "slug", slug, uiLocale, requestedLanguage);
}

export async function getAdminPromptPreview(
  db: D1Database, id: number, uiLocale: Locale, requestedLanguage: string | null,
): Promise<PromptDetail> {
  return loadPromptDetail(db, "id", id, uiLocale, requestedLanguage);
}

async function loadPromptDetail(
  db: D1Database, lookup: "slug" | "id", value: string | number,
  uiLocale: Locale, requestedLanguage: string | null,
): Promise<PromptDetail> {
  let requested: Locale | null = null;
  try { if (requestedLanguage !== null) requested = parseLocale(requestedLanguage); }
  catch { /* source fallback */ }

  const row = await db.prepare(`SELECT p.id, p.slug, p.status, p.deleted_at, p.source_language,
      p.title, p.description, p.prompt_template, p.image_alt,
      pt.title AS translated_title, pt.description AS translated_description,
      pt.prompt_template AS translated_template, pt.image_alt AS translated_alt,
      p.model, p.ratio, p.requires_reference_image, COALESCE(ct.name, c.name) AS category_name,
      p.original_image_key, p.original_width, p.original_height,
      p.preview_image_key, p.preview_width, p.preview_height
    FROM prompts p JOIN categories c ON c.id = p.category_id
    LEFT JOIN prompt_translations pt ON pt.prompt_id = p.id AND pt.locale = ?
      AND pt.locale <> p.source_language
    LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
      AND ct.locale <> c.source_language
    WHERE p.${lookup} = ?`).bind(requested, uiLocale, value).first<PromptRow>();

  if (!row || lookup === "slug" && row.status !== "published" && !row.deleted_at)
    throw new Response("Not Found", { status: 404 });
  if (row.deleted_at) throw new Response("Gone", { status: 410 });

  const contentLanguage = row.translated_title !== null && requested !== null
    ? requested : row.source_language;
  const [tags, variables, languages] = await Promise.all([
    db.prepare(`SELECT t.slug, COALESCE(tt.name, t.name) AS name
      FROM prompt_tags ptag JOIN tags t ON t.id = ptag.tag_id
      LEFT JOIN tag_translations tt ON tt.tag_id = t.id AND tt.locale = ?
        AND tt.locale <> t.source_language
      WHERE ptag.prompt_id = ? ORDER BY t.name`).bind(uiLocale, row.id)
      .all<{ slug: string; name: string }>(),
    db.prepare(`SELECT v.variable_key, v.label, v.input_placeholder, v.input_type,
        v.options_json, vt.label AS translated_label,
        vt.input_placeholder AS translated_placeholder
      FROM prompt_variables v
      LEFT JOIN prompt_variable_translations vt ON vt.variable_id = v.id
        AND vt.locale = ? AND vt.locale <> ?
      WHERE v.prompt_id = ? ORDER BY v.sort_order, v.id`)
      .bind(contentLanguage, row.source_language, row.id).all<VariableRow>(),
    db.prepare(`SELECT locale FROM prompt_translations
      WHERE prompt_id = ? AND locale <> ? ORDER BY locale`)
      .bind(row.id, row.source_language).all<{ locale: Locale }>(),
  ]);

  return {
    slug: row.slug,
    title: contentLanguage === row.source_language ? row.title : row.translated_title!,
    description: contentLanguage === row.source_language ? row.description : row.translated_description,
    promptTemplate: contentLanguage === row.source_language ? row.prompt_template : row.translated_template!,
    imageAlt: contentLanguage === row.source_language ? row.image_alt : row.translated_alt!,
    imageKey: row.original_image_key,
    imageWidth: row.original_width,
    imageHeight: row.original_height,
    previewImageKey: row.preview_image_key, previewWidth: row.preview_width,
    previewHeight: row.preview_height,
    model: row.model, ratio: row.ratio, categoryName: row.category_name,
    requiresReferenceImage: row.requires_reference_image === 1,
    tags: tags.results, sourceLanguage: row.source_language, contentLanguage,
    languages: [row.source_language, ...languages.results.map((item) => item.locale)],
    variables: variables.results.map((variable) => ({
      key: variable.variable_key, type: variable.input_type,
      label: variable.translated_label ?? variable.label,
      placeholder: variable.translated_label === null ? variable.input_placeholder : variable.translated_placeholder,
      options: variable.input_type === "select"
        ? parseSelectOptions(variable.options_json!, row.source_language).map((option) => ({
            value: option.value,
            label: resolveOptionLabel(option, row.source_language, contentLanguage),
          })) : [],
    })),
  };
}
