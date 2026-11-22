import type { Locale } from "../lib/localization";
import { recordExploreOptionsCache } from "../../workers/request-metrics";

type TaxonomyOption = { slug: string; name: string };
type ExploreOptions = {
  categories: TaxonomyOption[];
  tags: TaxonomyOption[];
  models: string[];
  ratios: string[];
};

export async function loadExploreOptions(db: D1Database, locale: Locale): Promise<ExploreOptions> {
  // Only public, published metadata is shared, independently of page filters and cookies.
  const key = `https://vault.disign.me/__internal-cache/explore-options/${locale}`;
  let cache: Cache | undefined;
  try {
    cache = await caches.open("explore-options-v1");
    const cached = await cache.match(key);
    if (cached) {
      const options = await cached.json<ExploreOptions>();
      recordExploreOptionsCache(db, "hit");
      return options;
    }
    recordExploreOptionsCache(db, "miss");
  } catch {
    recordExploreOptionsCache(db, "readError");
    console.warn("Explore options cache read failed");
  }

  const [categories, tags, models, ratios] = await Promise.all([
    db.prepare(`SELECT c.slug, COALESCE(ct.name, c.name) AS name
      FROM categories c
      LEFT JOIN category_translations ct ON ct.category_id = c.id
        AND ct.locale = ? AND c.source_language <> ?
      WHERE EXISTS (SELECT 1 FROM prompts p WHERE p.category_id = c.id
        AND p.status = 'published' AND p.deleted_at IS NULL)
      ORDER BY c.sort_order, c.name`)
      .bind(locale, locale).all<TaxonomyOption>(),
    db.prepare(`SELECT t.slug, COALESCE(tt.name, t.name) AS name
      FROM tags t
      LEFT JOIN tag_translations tt ON tt.tag_id = t.id
        AND tt.locale = ? AND tt.locale <> t.source_language
      WHERE EXISTS (SELECT 1 FROM prompt_tags ptag JOIN prompts p ON p.id = ptag.prompt_id
        WHERE ptag.tag_id = t.id AND p.status = 'published' AND p.deleted_at IS NULL)
      ORDER BY t.name`)
      .bind(locale).all<TaxonomyOption>(),
    db.prepare(`SELECT DISTINCT model FROM prompts
      WHERE status = 'published' AND deleted_at IS NULL AND model IS NOT NULL
      ORDER BY model`).all<{ model: string }>(),
    db.prepare(`SELECT DISTINCT ratio FROM prompts
      WHERE status = 'published' AND deleted_at IS NULL AND ratio IS NOT NULL
      ORDER BY ratio`).all<{ ratio: string }>(),
  ]);
  const options: ExploreOptions = {
    categories: categories.results,
    tags: tags.results,
    models: models.results.map((row) => row.model),
    ratios: ratios.results.map((row) => row.ratio),
  };

  if (cache) {
    try {
      await cache.put(key, Response.json(options, { headers: { "Cache-Control": "public, max-age=300" } }));
    } catch {
      recordExploreOptionsCache(db, "writeError");
      console.warn("Explore options cache write failed");
    }
  }
  return options;
}
