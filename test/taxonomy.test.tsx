import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";
import { ExplorePage, taxonomyMeta } from "../app/routes/explore-page";
import { loadExplore } from "../app/routes/explore-page.server";
import { exploreHref, pageHref } from "../app/lib/explore";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) await env.DB.prepare(statement).run();
}

const request = (path: string) => new Request(`https://vault.disign.me${path}`);
const scoped = (kind: "category" | "tag", slug: string, query = "") =>
  loadExplore(request("/" + kind + "/" + slug + query), { kind, slug });
const redirected = (path: string) => loadExplore(request(path)).catch((error: Response) => error);
const htmlOf = async (kind: "category" | "tag", slug: string, query = "") =>
  renderToStaticMarkup(createElement(ExplorePage, { loaderData: await scoped(kind, slug, query) }));

beforeAll(async () => {
  await applyMigration(migration1);
  await applyMigration(migration2);
  await applyMigration(migration4);
  await env.DB.prepare(`INSERT INTO categories
    (id, name, slug, description, created_at, updated_at) VALUES
    (1, '海报', 'poster', '中文分类说明', 'now', 'now'),
    (2, '摄影', 'photo', '中文摄影说明', 'now', 'now'),
    (3, '空分类', 'empty', NULL, 'now', 'now')`).run();
  await env.DB.prepare(`INSERT INTO category_translations
    (category_id, locale, name, description) VALUES
    (1, 'en-US', 'Posters', 'English category description'),
    (3, 'en-US', 'Empty category', NULL)`).run();
  await env.DB.prepare(`INSERT INTO tags (id, name, slug, created_at, updated_at) VALUES
    (1, '电影感', 'cinematic', 'now', 'now'),
    (2, '旅行', 'travel', 'now', 'now'),
    (3, '空标签', 'empty', 'now', 'now')`).run();
  await env.DB.prepare(`INSERT INTO tag_translations (tag_id, locale, name)
    VALUES (1, 'en-US', 'Cinematic')`).run();
  const insert = env.DB.prepare(`INSERT INTO prompts
    (id, slug, title, prompt_template, category_id, original_image_key,
     preview_image_key, original_content_type, original_width, original_height,
     preview_width, preview_height, original_size_bytes, preview_size_bytes,
     image_alt, status, published_at, deleted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'body', ?, 'original', ?, 'image/png', 400, 600,
      200, 300, 100, 50, ?, ?, ?, ?, 'now', 'now')`);
  for (let id = 1; id <= 25; id++) {
    await insert.bind(id, `prompt-${id}`, id === 1 ? "原文标题" : `海报 ${id}`, 1,
      `preview/${id}.png`, `alt ${id}`, "published",
      id <= 2 ? "2026-09-21" : "2026-09-20", null).run();
    await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, 1)")
      .bind(id).run();
  }
  await insert.bind(26, "photo-prompt", "摄影原文", 2, "preview/26.png",
    "photo alt", "published", "2026-09-19", null).run();
  await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (26, 2)").run();
  await insert.bind(27, "draft-prompt", "草稿", 1, "preview/27.png",
    "draft alt", "draft", "2026-09-22", null).run();
  await insert.bind(28, "deleted-prompt", "删除", 1, "preview/28.png",
    "deleted alt", "published", "2026-09-22", "now").run();
  await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (27, 1), (28, 1)").run();
  await env.DB.prepare(`INSERT INTO prompt_translations
    (prompt_id, locale, title, prompt_template, image_alt)
    VALUES (1, 'en-US', 'Translated title', 'body', 'Translated alt')`).run();
});

describe("Category and Tag Explore routes", () => {
  it("redirects legacy query URLs to one path identity", async () => {
    for (const [input, location] of [
      ["/?category=poster", "/category/poster"],
      ["/?tag=cinematic", "/tag/cinematic"],
      ["/?category=poster&tag=cinematic&model=Flux", "/category/poster?tag=cinematic&model=Flux"],
      ["/?category=POSTER", "/category/poster"],
    ]) {
      const response = await redirected(input);
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get("Location")).toBe(location);
    }
    await expect(loadExplore(request("/?category=missing"))).rejects.toMatchObject({ status: 404 });
  });

  it("renders full Explore controls with selected taxonomy and localized metadata", async () => {
    const category = await scoped("category", "poster", "?ui_locale=en-US");
    const tag = await scoped("tag", "cinematic", "?ui_locale=en-US");
    expect(category).toMatchObject({ taxonomy: { name: "Posters", description: "English category description" },
      filters: { category: "poster" }, total: 25, totalPages: 2 });
    expect(tag).toMatchObject({ taxonomy: { name: "Cinematic" }, filters: { tag: "cinematic" }, total: 25 });
    for (const [data, selected] of [[category, "Style category: Posters"], [tag, "Tags: Cinematic"]] as const) {
      const html = renderToStaticMarkup(createElement(ExplorePage, { loaderData: data }));
      expect(html).toContain("explore-filters");
      expect(html).toContain("sort-options");
      expect(html).toContain("content-types");
      expect(html).toContain("filter-menu");
      expect(html).toContain("原文标题");
      expect(html).toContain(selected);
      expect(html).toContain("prompt-grid");
      expect(html).not.toContain("<select");
    }
    expect(taxonomyMeta(category)).toContainEqual({ name: "description", content: "English category description" });
    expect(taxonomyMeta(tag)).toContainEqual({ name: "description", content: "Explore image prompts tagged Cinematic." });
    expect((await scoped("category", "photo", "?ui_locale=en-US")).taxonomy)
      .toMatchObject({ name: "摄影", description: "中文摄影说明", contentLanguage: "zh-CN" });
    expect((await scoped("category", "empty")).cards).toHaveLength(0);
    expect((await scoped("tag", "empty")).cards).toHaveLength(0);
  });

  it("keeps path scope in links, search and pagination", async () => {
    const categoryUrl = new URL("https://vault.disign.me/category/poster?ui_locale=en-US&model=Flux&tag=cinematic&page=2");
    const tagUrl = new URL("https://vault.disign.me/tag/cinematic?ui_locale=en-US&category=poster&page=2");
    expect(exploreHref(categoryUrl, "tag", "travel")).toBe("/category/poster?ui_locale=en-US&model=Flux&tag=travel");
    expect(exploreHref(tagUrl, "category", "photo")).toBe("/tag/cinematic?ui_locale=en-US&category=photo");
    expect(exploreHref(categoryUrl, "category", "")).toBe("/tag/cinematic?ui_locale=en-US&model=Flux");
    expect(exploreHref(tagUrl, "tag", "")).toBe("/category/poster?ui_locale=en-US");
    expect(exploreHref(categoryUrl, "category", "photo")).toBe("/category/photo?ui_locale=en-US&model=Flux&tag=cinematic");
    expect(pageHref(categoryUrl, 3)).toContain("/category/poster?");
    const categoryHtml = await htmlOf("category", "poster", "?ui_locale=en-US");
    expect(categoryHtml).toContain('action="/category/poster"');
    expect(categoryHtml).not.toContain('name="category" value="poster"');
    expect(categoryHtml).toContain('href="/category/poster?ui_locale=en-US&amp;page=2"');
    const tagHtml = await htmlOf("tag", "cinematic", "?ui_locale=en-US");
    expect(tagHtml).toContain('action="/tag/cinematic"');
    expect(tagHtml).not.toContain('name="tag" value="cinematic"');
  });

  it("normalizes path slug and duplicate query; rejects unknown and invalid pages", async () => {
    for (const [path, location] of [
      ["/category/POSTER?ui_locale=en-US", "/category/poster?ui_locale=en-US"],
      ["/tag/CINEMATIC", "/tag/cinematic"],
      ["/category/poster?category=poster", "/category/poster"],
      ["/tag/cinematic?tag=cinematic", "/tag/cinematic"],
      ["/category/poster?page=1", "/category/poster"],
    ]) {
      const response = await loadExplore(request(path), path.startsWith("/tag/") ?
        { kind: "tag", slug: path.split("/")[2].split("?")[0] } :
        { kind: "category", slug: path.split("/")[2].split("?")[0] }).catch((error: Response) => error);
      expect((response as Response).headers.get("Location")).toBe(location);
    }
    await expect(scoped("category", "missing")).rejects.toMatchObject({ status: 404 });
    await expect(scoped("tag", "missing")).rejects.toMatchObject({ status: 404 });
    await expect(scoped("category", "poster", "?page=0")).rejects.toMatchObject({ status: 404 });
    await expect(scoped("category", "poster", "?page=3")).rejects.toMatchObject({ status: 404 });
  });

  it("indexes base paths and sends filtered combinations to base canonical", async () => {
    const base = await scoped("category", "poster", "?ui_locale=en-US");
    const page2 = await scoped("category", "poster", "?page=2");
    expect(page2.cards).toHaveLength(1);
    expect(taxonomyMeta(base)).toContainEqual({ name: "robots", content: "index,follow" });
    expect(taxonomyMeta(page2)).toContainEqual({ tagName: "link", rel: "canonical",
      href: "https://vault.disign.me/category/poster?page=2" });
    for (const query of ["?tag=cinematic", "?model=Flux", "?ratio=1%3A1", "?q=poster",
      "?sort=popular", "?content_type=image", "?source_language=en-US", "?tag=cinematic&page=2"]) {
      const data = await scoped("category", "poster", query);
      expect(taxonomyMeta(data)).toContainEqual({ name: "robots", content: "noindex,follow" });
      expect(taxonomyMeta(data)).toContainEqual({ tagName: "link", rel: "canonical",
        href: "https://vault.disign.me/category/poster" });
    }
    const filteredTag = await scoped("tag", "cinematic", "?category=poster");
    expect(taxonomyMeta(filteredTag)).toContainEqual({ name: "robots", content: "noindex,follow" });
  });
});
