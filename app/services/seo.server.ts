import { canonicalUrl } from "../lib/seo";

type SitemapRow = { slug: string; updated_at: string };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

export async function buildSitemap(db: D1Database): Promise<string> {
  const [prompts, categories, tags] = await Promise.all([
    db.prepare(`SELECT slug, updated_at FROM prompts
      WHERE status = 'published' AND deleted_at IS NULL ORDER BY id`)
      .all<SitemapRow>(),
    db.prepare(`SELECT c.slug, c.updated_at FROM categories c
      WHERE EXISTS (SELECT 1 FROM prompts p WHERE p.category_id = c.id
        AND p.status = 'published' AND p.deleted_at IS NULL) ORDER BY c.id`)
      .all<SitemapRow>(),
    db.prepare(`SELECT t.slug, t.updated_at FROM tags t
      WHERE EXISTS (SELECT 1 FROM prompt_tags pt JOIN prompts p ON p.id = pt.prompt_id
        WHERE pt.tag_id = t.id AND p.status = 'published' AND p.deleted_at IS NULL)
      ORDER BY t.id`).all<SitemapRow>(),
  ]);
  const entries = [
    { url: canonicalUrl("/"), lastmod: null },
    { url: canonicalUrl("/image"), lastmod: null },
    ...prompts.results.map((row) => ({ url: canonicalUrl(`/prompt/${encodeURIComponent(row.slug)}`), lastmod: row.updated_at })),
    ...categories.results.map((row) => ({ url: canonicalUrl(`/category/${encodeURIComponent(row.slug)}`), lastmod: row.updated_at })),
    ...categories.results.map((row) => ({ url: canonicalUrl(`/image/category/${encodeURIComponent(row.slug)}`), lastmod: row.updated_at })),
    ...tags.results.map((row) => ({ url: canonicalUrl(`/tag/${encodeURIComponent(row.slug)}`), lastmod: row.updated_at })),
    ...tags.results.map((row) => ({ url: canonicalUrl(`/image/tag/${encodeURIComponent(row.slug)}`), lastmod: row.updated_at })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
    .map(({ url, lastmod }) => `  <url><loc>${escapeXml(url)}</loc>${lastmod === null ? "" : `<lastmod>${escapeXml(lastmod)}</lastmod>`}</url>`)
    .join("\n")}
</urlset>
`;
}
