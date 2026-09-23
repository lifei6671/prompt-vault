import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import Home, { loader as homeLoader, meta as homeMeta } from "../app/routes/home";
import Detail, { loader as detailLoader, meta as detailMeta } from "../app/routes/prompt-detail";
import { loader as robotsLoader } from "../app/routes/robots.txt";
import { loader as sitemapLoader } from "../app/routes/sitemap.xml";
import { loadTaxonomy } from "../app/routes/taxonomy-page.server";
import TaxonomyPage, { taxonomyMeta } from "../app/routes/taxonomy-page";
import { documentLanguage } from "../app/root";
import { buildSitemap } from "../app/services/seo.server";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) await env.DB.prepare(statement).run();
}
const request = (path: string) => new Request(`https://alternate.example${path}`);
const explore = (path: string) => homeLoader({ request: request(path) } as Parameters<typeof homeLoader>[0]);
const detail = (path: string) => detailLoader(
  { request: request(path), params: { slug: "poster" } } as Parameters<typeof detailLoader>[0],
);
const meta = (data: Awaited<ReturnType<typeof explore>>) =>
  homeMeta({ loaderData: data } as Parameters<typeof homeMeta>[0]);

beforeAll(async () => {
  await applyMigration(migration1);
  await applyMigration(migration2);
  await env.DB.prepare(`INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES
    (1, '海报', 'poster', '2026-09-20T00:00:00Z', '2026-09-21T00:00:00Z'),
    (2, '草稿分类', 'draft-only', '2026-09-20T00:00:00Z', '2026-09-21T00:00:00Z'),
    (3, '空分类', 'empty', '2026-09-20T00:00:00Z', '2026-09-21T00:00:00Z')`).run();
  await env.DB.prepare(`INSERT INTO tags (id, name, slug, created_at, updated_at) VALUES
    (1, '电影感', 'cinematic', '2026-09-20T00:00:00Z', '2026-09-22T00:00:00Z'),
    (2, '草稿标签', 'draft-only', '2026-09-20T00:00:00Z', '2026-09-22T00:00:00Z'),
    (3, '空标签', 'empty', '2026-09-20T00:00:00Z', '2026-09-22T00:00:00Z')`).run();
  const insert = env.DB.prepare(`INSERT INTO prompts
    (id, slug, title, description, prompt_template, category_id, original_image_key,
     preview_image_key, original_content_type, original_width, original_height,
     preview_width, preview_height, original_size_bytes, preview_size_bytes,
     image_alt, status, published_at, deleted_at, created_at, updated_at, source_language)
    VALUES (?, ?, ?, ?, ?, ?, 'original/poster.png', 'preview/poster.png',
      'image/png', 800, 1200, 400, 600, 100, 50, ?, ?, ?, ?,
      '2026-09-20T00:00:00Z', '2026-09-23T01:02:03Z', 'zh-CN')`);
  for (let id = 1; id <= 25; id++) {
    await insert.bind(id, id === 1 ? "poster" : `poster-${id}`,
      id === 1 ? "原文标题" : `海报 ${id}`, "原文描述", "画一张海报", 1,
      "原文图片", "published", "2026-09-20T00:00:00Z", null).run();
    await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, 1)")
      .bind(id).run();
  }
  await insert.bind(26, "draft", "草稿", null, "hidden", 2, "hidden", "draft", null, null).run();
  await insert.bind(27, "deleted", "删除", null, "hidden", 2, "hidden", "published",
    "2026-09-20T00:00:00Z", "2026-09-22T00:00:00Z").run();
  await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (26, 2), (27, 2)").run();
  await env.DB.prepare(`INSERT INTO prompt_translations
    (prompt_id, locale, title, description, prompt_template, image_alt)
    VALUES (1, 'en-US', 'Translated title', 'Translated description', 'Paint a poster', 'Translated alt')`).run();
});

describe("public SEO metadata", () => {
  it("uses one canonical host and keeps only real pagination in canonical URLs", async () => {
    const first = meta(await explore("/?ui_locale=en-US&prompt_locale=zh-CN"));
    expect(first).toContainEqual({ tagName: "link", rel: "canonical", href: "https://vault.disign.me/" });
    expect(first).toContainEqual({ name: "robots", content: "index,follow" });
    const second = meta(await explore("/?page=2&ui_locale=en-US"));
    expect(second).toContainEqual({ tagName: "link", rel: "canonical", href: "https://vault.disign.me/?page=2" });
    const filtered = meta(await explore("/?unknown=1&ui_locale=en-US&prompt_locale=zh-CN&page=2"));
    const searched = meta(await explore("/?q=poster&model=Flux&ratio=3%3A4&source_language=en-US"));
    expect(searched).toContainEqual({ name: "robots", content: "noindex,follow" });
    expect(filtered).toContainEqual({ tagName: "link", rel: "canonical", href: "https://vault.disign.me/?page=2" });
    expect(filtered).toContainEqual({ name: "robots", content: "noindex,follow" });
    expect(meta(await explore("/?unknown=1"))).toContainEqual({ name: "robots", content: "noindex,follow" });
    expect(meta(await explore("/?category=missing"))).toContainEqual({ name: "robots", content: "noindex,follow" });
    await expect(explore("/?page=0&q=poster")).rejects.toMatchObject({ status: 404 });
    await expect(explore("/?page=3")).rejects.toMatchObject({ status: 404 });
  });

  it("redirects a category-only filter and keeps fixed Category and Tag canonical pagination", async () => {
    const redirected = await explore("/?category=poster&ui_locale=en-US").catch((error: Response) => error);
    expect(redirected).toBeInstanceOf(Response);
    expect((redirected as Response).status).toBe(302);
    expect((redirected as Response).headers.get("Location"))
      .toBe("/category/poster?ui_locale=en-US");
    const translatedQuery = await explore("/?category=POSTER&prompt_locale=en-US&page=2")
      .catch((error: Response) => error);
    expect((translatedQuery as Response).headers.get("Location"))
      .toBe("/category/poster?page=2");
    const category = await loadTaxonomy(request("/category/poster?page=2&ui_locale=en-US"), "poster", "category");
    const tag = await loadTaxonomy(request("/tag/cinematic?ui_locale=en-US"), "cinematic", "tag");
    expect(taxonomyMeta(category)).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/category/poster?page=2" });
    expect(taxonomyMeta(tag)).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/tag/cinematic" });
    const upperCategory = await loadTaxonomy(request("/category/POSTER?ui_locale=en-US"), "POSTER", "category");
    const upperTag = await loadTaxonomy(request("/tag/CINEMATIC?ui_locale=en-US"), "CINEMATIC", "tag");
    expect(taxonomyMeta(upperCategory)).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/category/poster" });
    expect(taxonomyMeta(upperTag)).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/tag/cinematic" });
    expect(taxonomyMeta(category)).toContainEqual({ name: "robots", content: "index,follow" });
    const filteredTag = await loadTaxonomy(request("/tag/cinematic?model=Flux"), "cinematic", "tag");
    expect(taxonomyMeta(filteredTag)).toContainEqual({ name: "robots", content: "noindex,follow" });
    expect(taxonomyMeta(filteredTag)).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/tag/cinematic" });
    const html = renderToStaticMarkup(createElement(TaxonomyPage, category));
    expect(html).toContain("原文标题");
    expect(html).toContain("https://vault-pic.disign.me/preview/poster.png");
  });

  it("uses displayed Prompt content for meta, preview image for OG, and source image in SSR body", async () => {
    const translated = await detail("/prompt/poster?ui_locale=zh-CN&prompt_locale=en-US");
    const original = await detail("/prompt/poster?ui_locale=en-US&prompt_locale=fr-FR");
    const translatedMeta = detailMeta({ loaderData: translated } as Parameters<typeof detailMeta>[0]);
    const originalMeta = detailMeta({ loaderData: original } as Parameters<typeof detailMeta>[0]);
    expect(translatedMeta).toContainEqual({ title: "Translated title · PromptVault" });
    expect(originalMeta).toContainEqual({ title: "原文标题 · PromptVault" });
    expect(translatedMeta).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/prompt/poster" });
    expect(translatedMeta).toContainEqual({ property: "og:url", content: "https://vault.disign.me/prompt/poster" });
    expect(translatedMeta).toContainEqual({ property: "og:title", content: "Translated title" });
    expect(translatedMeta).toContainEqual({ property: "og:description", content: "Translated description" });
    expect(translatedMeta).toContainEqual({ property: "og:image",
      content: "https://vault-pic.disign.me/preview/poster.png" });
    expect(translatedMeta).toContainEqual({ property: "og:image:width", content: "400" });
    expect(translatedMeta).toContainEqual({ property: "og:image:height", content: "600" });
    expect(documentLanguage([{ id: "routes/prompt-detail", loaderData: translated }], "zh-CN")).toBe("en-US");
    expect(documentLanguage([{ id: "routes/prompt-detail", loaderData: original }], "en-US")).toBe("zh-CN");
    expect(documentLanguage([{ id: "routes/home", loaderData: {} }], "en-US")).toBe("en-US");
    const detailProps = { loaderData: original } as Parameters<typeof Detail>[0];
    const body = renderToStaticMarkup(createElement(Detail, detailProps));
    expect(body).toContain("<h1 lang=\"zh-CN\">原文标题</h1>");
    expect(body).toContain("画一张海报");
    expect(body).toContain("alt=\"原文图片\"");
    expect(body).toContain("width=\"800\" height=\"1200\"");
    expect(body).toContain("https://vault-pic.disign.me/original/poster.png");
    const homeProps = { loaderData: await explore("/") } as Parameters<typeof Home>[0];
    const home = renderToStaticMarkup(createElement(Home, homeProps));
    expect(home).toContain("海报 25");
    expect(home).toContain("https://vault-pic.disign.me/preview/poster.png");
  });
});

describe("crawler resources", () => {
  it("serves robots.txt as UTF-8 plain text", async () => {
    const response = robotsLoader();
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /admin/");
    expect(body).toContain("Sitemap: https://vault.disign.me/sitemap.xml");
  });

  it("serves a clean sitemap with public URLs, lastmod, XML escaping, and three SQL queries", async () => {
    const queries: string[] = [];
    const db = { prepare(sql: string) { queries.push(sql); return env.DB.prepare(sql); } } as D1Database;
    const xml = await buildSitemap(db);
    expect(queries).toHaveLength(3);
    expect(xml).toContain("<loc>https://vault.disign.me/</loc>");
    expect(xml).toContain("<loc>https://vault.disign.me/prompt/poster</loc><lastmod>2026-09-23T01:02:03Z</lastmod>");
    expect(xml).toContain("<loc>https://vault.disign.me/category/poster</loc><lastmod>2026-09-21T00:00:00Z</lastmod>");
    expect(xml).toContain("<loc>https://vault.disign.me/tag/cinematic</loc><lastmod>2026-09-22T00:00:00Z</lastmod>");
    for (const value of ["/prompt/draft", "/prompt/deleted", "/category/draft-only",
      "/category/empty", "/tag/draft-only", "/tag/empty", "ui_locale", "prompt_locale", "?q="]) {
      expect(xml).not.toContain(value);
    }
    expect(xml.match(/<loc>https:\/\/vault\.disign\.me\/prompt\//g)).toHaveLength(25);
    await env.DB.prepare(`INSERT INTO prompts
      (id, slug, title, prompt_template, category_id, original_image_key, preview_image_key,
       original_content_type, original_width, original_height, preview_width, preview_height,
       original_size_bytes, preview_size_bytes, image_alt, status, published_at, created_at, updated_at)
      VALUES (28, 'quote''prompt', 'Quote', 'body', 1, 'original', 'preview', 'image/png',
        1, 1, 1, 1, 1, 1, 'alt', 'published', '2026-09-20T00:00:00Z',
        '2026-09-20T00:00:00Z', '2026-09-23T00:00:00Z')`).run();
    expect(await buildSitemap(env.DB)).toContain("/prompt/quote&apos;prompt</loc>");
    const response = await sitemapLoader();
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(await response.text()).toContain("<urlset");
  });
});
