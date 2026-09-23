import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import TaxonomyPage, { taxonomyMeta } from "../app/routes/taxonomy-page";
import { loadTaxonomy } from "../app/routes/taxonomy-page.server";
import { listTaxonomyPrompts } from "../app/services/prompt.server";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) await env.DB.prepare(statement).run();
}

const request = (path: string) => new Request(`https://vault.disign.me${path}`);
const category = (slug: string, locale: "zh-CN" | "en-US" = "zh-CN", page = 1) =>
  listTaxonomyPrompts(env.DB, "category", slug, locale, page);
const tag = (slug: string, locale: "zh-CN" | "en-US" = "zh-CN", page = 1) =>
  listTaxonomyPrompts(env.DB, "tag", slug, locale, page);

beforeAll(async () => {
  await applyMigration(migration1);
  await applyMigration(migration2);
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

describe("Category and Tag D1 listings", () => {
  it("renders category SSR data with translated heading and source prompt cards", async () => {
    const data = await loadTaxonomy(request("/category/poster?ui_locale=en-US"), "poster", "category");
    const html = renderToStaticMarkup(createElement(TaxonomyPage, data));
    expect(data).toMatchObject({ name: "Posters", description: "English category description",
      contentLanguage: "en-US", total: 25, totalPages: 2 });
    expect(data.cards).toHaveLength(24);
    expect(data.cards.slice(0, 2).map((card) => card.slug)).toEqual(["prompt-2", "prompt-1"]);
    expect(data.cards.find((card) => card.slug === "prompt-1")).toMatchObject({
      title: "原文标题", category_name: "Posters", image_alt: "alt 1",
      preview_width: 200, preview_height: 300,
    });
    expect(html).toContain("<h1 lang=\"en-US\">Posters</h1>");
    expect(html).toContain("English category description");
    expect(html).toContain("原文标题");
    expect(html).not.toContain("Translated title");
    expect(html).toContain('width="200" height="300"');
    expect(html).toContain('href="/category/poster?ui_locale=en-US&amp;page=2"');
    expect(html).toContain(env.IMAGE_BASE_URL);
    expect(taxonomyMeta(data)).toContainEqual({
      name: "description", content: "English category description",
    });
  });

  it("renders tag SSR data with translated name and source fallback", async () => {
    const translated = await loadTaxonomy(request("/tag/cinematic?ui_locale=en-US"),
      "cinematic", "tag");
    const html = renderToStaticMarkup(createElement(TaxonomyPage, translated));
    expect(translated).toMatchObject({ name: "Cinematic", contentLanguage: "en-US", total: 25 });
    expect(html).toContain("<h1 lang=\"en-US\">#Cinematic</h1>");
    expect(html).toContain("原文标题");
    expect(html).toContain('href="/tag/cinematic?ui_locale=en-US&amp;page=2"');
    expect((await tag("travel", "en-US")).name).toBe("旅行");
    expect((await tag("travel", "en-US")).contentLanguage).toBe("zh-CN");
    expect(taxonomyMeta(translated)).toContainEqual({
      name: "description", content: "Explore image prompts tagged Cinematic.",
    });
  });

  it("falls back as a whole row and keeps known empty scopes valid", async () => {
    expect(await category("photo", "en-US")).toMatchObject({
      name: "摄影", description: "中文摄影说明", contentLanguage: "zh-CN",
    });
    expect(await category("empty", "en-US")).toMatchObject({
      name: "Empty category", description: null, total: 0,
    });
    expect((await tag("empty")).cards).toHaveLength(0);
  });

  it("excludes draft and deleted prompts from both scopes", async () => {
    for (const result of [await category("poster"), await tag("cinematic")]) {
      expect(result.total).toBe(25);
      expect(result.cards.every((card) => !["draft-prompt", "deleted-prompt"]
        .includes(card.slug))).toBe(true);
    }
  });

  it("rejects unknown slugs and invalid or out-of-range pages", async () => {
    await expect(category("missing")).rejects.toMatchObject({ status: 404 });
    await expect(tag("missing")).rejects.toMatchObject({ status: 404 });
    await expect(category("poster", "zh-CN", 3)).rejects.toMatchObject({ status: 404 });
    await expect(tag("cinematic", "zh-CN", 3)).rejects.toMatchObject({ status: 404 });
    for (const kind of ["category", "tag"] as const) {
      for (const page of ["0", "-1", "01", "abc", "999999999999999999999"]) {
        await expect(loadTaxonomy(request(`/${kind}/poster?page=${page}`), "poster", kind))
          .rejects.toMatchObject({ status: 404 });
      }
      const slug = kind === "category" ? "poster" : "cinematic";
      const redirected = await loadTaxonomy(
        request(`/${kind}/${slug}?page=1&ui_locale=en-US`), slug, kind,
      ).catch((error: Response) => error);
      expect(redirected).toBeInstanceOf(Response);
      expect((redirected as Response).status).toBe(302);
      expect((redirected as Response).headers.get("Location"))
        .toBe(`/${kind}/${slug}?ui_locale=en-US`);
    }
  });

  it("serves a stable second page and preserves locale in real pagination links", async () => {
    for (const kind of ["category", "tag"] as const) {
      const data = await loadTaxonomy(request(`/${kind}/${kind === "tag" ? "cinematic" : "poster"}?page=2&ui_locale=en-US`),
        kind === "tag" ? "cinematic" : "poster", kind);
      expect(data.cards).toHaveLength(1);
      expect(data.cards[0].slug).toBe("prompt-3");
      const html = renderToStaticMarkup(createElement(TaxonomyPage, data));
      expect(html).toContain(`href="/${kind}/${kind === "tag" ? "cinematic" : "poster"}?ui_locale=en-US"`);
    }
  });

  it("uses three D1 queries per page regardless of card count", async () => {
    const queries: string[] = [];
    const db = { prepare(sql: string) {
      queries.push(sql);
      return env.DB.prepare(sql);
    } } as unknown as D1Database;
    const result = await listTaxonomyPrompts(db, "tag", "cinematic", "en-US", 1);
    expect(result.cards).toHaveLength(24);
    expect(queries).toHaveLength(3);
    expect(queries[2]).toContain("LEFT JOIN category_translations");
  });
});
