import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExploreFiltersBar } from "../app/components/explore-filters";
import { SiteHeader } from "../app/components/site-header";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";
import {
  exploreHref, localeHref, pageHref, previewImageUrl, readExploreFilters, readPage,
  readUiLocale, uiLocaleCookie,
} from "../app/lib/explore";
import { listExplorePrompts } from "../app/services/prompt.server";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

const filters = (query = "") => readExploreFilters(new URLSearchParams(query));
const list = (query = "", locale: "zh-CN" | "en-US" = "zh-CN", page = 1) =>
  listExplorePrompts(env.DB, filters(query), locale, page);

beforeAll(async () => {
  await applyMigration(migration1);
  await applyMigration(migration2);
  await applyMigration(migration4);
  await env.DB.prepare(
    "INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES (1, '海报', 'poster', 'now', 'now'), (2, '摄影', 'photo', 'now', 'now')",
  ).run();
  await env.DB.prepare("UPDATE categories SET sort_order = 1 WHERE id = 2").run();
  await env.DB.prepare(
    "INSERT INTO category_translations (category_id, locale, name) VALUES (1, 'en-US', 'Poster Design')",
  ).run();
  await env.DB.prepare(
    "INSERT INTO tags (id, name, slug, created_at, updated_at) VALUES (1, '电影感', 'cinematic', 'now', 'now')",
  ).run();
  await env.DB.prepare(
    "INSERT INTO tag_translations (tag_id, locale, name) VALUES (1, 'en-US', 'Cinematic')",
  ).run();

  const insert = env.DB.prepare(`INSERT INTO prompts
    (id, slug, title, description, prompt_template, model, ratio, category_id,
     original_image_key, preview_image_key, original_content_type, original_width,
     original_height, preview_width, preview_height, original_size_bytes,
     preview_size_bytes, image_alt, status, published_at, deleted_at,
     created_at, updated_at, source_language)
    VALUES (?, ?, ?, ?, 'body', ?, ?, ?, 'original', ?, 'image/png', 400, 600,
            200, 300, 100, 50, ?, ?, ?, ?, 'now', 'now', ?)`);
  async function prompt(
    id: number, title: string, description: string, model: string, ratio: string,
    category: number, status = "published", deleted: string | null = null,
    published = "2026-09-20", language = "zh-CN",
  ) {
    await insert.bind(id, `prompt-${id}`, title, description, model, ratio, category,
      `preview/${id}.png`, title, status, published, deleted, language).run();
  }
  await prompt(1, "雨夜海报", "城市夜景", "Midjourney", "3:4", 1);
  await prompt(2, "Blue portrait", "Portrait study", "Flux", "1:1", 2, "published", null, "2026-09-20", "en-US");
  await prompt(3, "旧海报", "Archive", "Midjourney", "16:9", 1, "published", null, "2026-09-19");
  await prompt(4, "草稿", "Hidden", "Flux", "1:1", 1, "draft");
  await prompt(5, "已删除", "Hidden", "Flux", "1:1", 1, "published", "2026-09-21");
  for (let id = 6; id <= 28; id++) {
    await prompt(id, `Archive ${id}`, "Older", "Other", "2:3", 2, "published", null, "2026-09-18");
  }
  await env.DB.prepare(
    "INSERT INTO prompt_translations (prompt_id, locale, title, description, prompt_template, image_alt) VALUES (1, 'en-US', 'Rainy poster', 'City art', 'body', 'Rainy poster')",
  ).run();
  await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (1, 1)").run();
});

describe("Explore D1 listing", () => {
  it("lists only published, nondeleted cards in stable newest order, 24 per page", async () => {
    const result = await list();
    expect(result.total).toBe(26);
    expect(result.cards).toHaveLength(24);
    expect(result.cards.slice(0, 3).map((card) => card.slug)).toEqual(["prompt-2", "prompt-1", "prompt-3"]);
    expect(result.cards.every((card) => card.slug !== "prompt-4" && card.slug !== "prompt-5")).toBe(true);
    expect(result.cards[1].title).toBe("雨夜海报");
  });

  it("uses category priority for recommended and stable newest fallback for popular", async () => {
    expect((await list("sort=recommended")).cards.slice(0, 3).map((card) => card.slug))
      .toEqual(["prompt-1", "prompt-3", "prompt-2"]);
    for (const sort of ["popular", "latest"]) {
      const result = await list("sort=" + sort);
      expect(result.cards.slice(0, 3).map((card) => card.slug))
        .toEqual(["prompt-2", "prompt-1", "prompt-3"]);
      expect(result.total).toBe(26);
    }
    expect((await list("content_type=image")).total).toBe(26);
  });

  it("filters category, model, ratio, and source language", async () => {
    expect((await list("category=poster")).cards.map((card) => card.slug)).toEqual(["prompt-1", "prompt-3"]);
    expect((await list("model=Flux")).cards.map((card) => card.slug)).toEqual(["prompt-2"]);
    expect((await list("ratio=16%3A9")).cards.map((card) => card.slug)).toEqual(["prompt-3"]);
    expect((await list("source_language=en-US")).cards.map((card) => card.slug)).toEqual(["prompt-2"]);
    expect((await list("category=poster&model=Flux")).total).toBe(0);
    expect((await list("tag=cinematic")).cards.map((card) => card.slug)).toEqual(["prompt-1"]);
    expect((await list("category=poster&tag=cinematic")).cards.map((card) => card.slug)).toEqual(["prompt-1"]);
    expect((await list("category=photo&tag=cinematic")).total).toBe(0);
  });

  it("searches source title, description, model, category, tag and translated names", async () => {
    for (const q of ["雨夜", "城市夜景", "Midjourney", "海报", "电影感",
      "Rainy poster", "Poster Design", "Cinematic"]) {
      expect((await list(`q=${encodeURIComponent(q)}`)).cards.some((card) => card.slug === "prompt-1")).toBe(true);
    }
    expect((await list("q=Hidden")).total).toBe(0);
    expect((await list("q=%25")).total).toBe(0);
  });

  it("localizes category metadata with source fallback without translating prompt titles", async () => {
    const result = await list("", "en-US");
    expect(result.cards.find((card) => card.slug === "prompt-1")).toMatchObject({
      title: "雨夜海报", category_name: "Poster Design", image_alt: "雨夜海报",
    });
    expect(result.cards.find((card) => card.slug === "prompt-2")?.category_name).toBe("摄影");
    expect(result.categories.find((category) => category.slug === "photo")?.name).toBe("摄影");
    expect(result.tags).toContainEqual({ slug: "cinematic", name: "Cinematic" });
  });

  it("returns a real second page and rejects pages past the end", async () => {
    const result = await list("", "zh-CN", 2);
    expect(result.cards).toHaveLength(2);
    expect(result.cards.map((card) => card.slug)).toEqual(["prompt-7", "prompt-6"]);
    await expect(list("", "zh-CN", 3)).rejects.toMatchObject({ status: 404 });
    await expect(list("model=Flux", "zh-CN", 2)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Explore URL and UI locale", () => {
  it("validates page and keeps filters in pagination links", () => {
    expect(readPage(new URLSearchParams())).toBe(1);
    expect(readPage(new URLSearchParams("page=2"))).toBe(2);
    for (const page of ["0", "-1", "1.5", "01", "abc", "999999999999999999999"]) {
      expect(() => readPage(new URLSearchParams(`page=${page}`))).toThrow();
    }
    const url = new URL("https://vault.disign.me/?q=rain&model=Flux&page=2");
    expect(pageHref(url, 1)).toBe("/?q=rain&model=Flux");
    expect(pageHref(url, 3)).toBe("/?q=rain&model=Flux&page=3");
  });

  it("parses content and sort safely and preserves query state in tab links", () => {
    expect(filters()).toMatchObject({ contentType: "all", sort: "latest" });
    expect(filters("content_type=image&sort=popular")).toMatchObject({ contentType: "image", sort: "popular" });
    expect(filters("sort=recommended").sort).toBe("recommended");
    expect(filters("content_type=video&sort=unknown")).toMatchObject({ contentType: "all", sort: "latest" });
    const url = new URL("https://vault.disign.me/?ui_locale=en-US&q=rain&category=poster&tag=cinematic&model=Flux&ratio=1%3A1&source_language=en-US&sort=popular&content_type=image&page=2");
    const imageHref = exploreHref(url, "content_type", "");
    expect(imageHref).toContain("ui_locale=en-US");
    expect(imageHref).toContain("q=rain");
    expect(imageHref).toContain("category=poster");
    expect(imageHref).toContain("sort=popular");
    expect(imageHref).not.toContain("content_type=");
    expect(imageHref).not.toContain("page=");
    const sortHref = exploreHref(url, "sort", "recommended");
    expect(sortHref).toContain("content_type=image");
    expect(sortHref).toContain("sort=recommended");
    expect(sortHref).not.toContain("page=");
    expect(exploreHref(url, "tag", "")).not.toContain("tag=");
  });

  it("builds the direct image URL with encoded object-key segments", () => {
    expect(previewImageUrl("https://vault-pic.disign.me/", "preview/雨 夜.png"))
      .toBe("https://vault-pic.disign.me/preview/%E9%9B%A8%20%E5%A4%9C.png");
  });

  it("resolves explicit locale before cookie, falls back safely, and preserves the query when switching", () => {
    const request = (url: string, cookie = "") => new Request(url, { headers: { Cookie: cookie } });
    expect(readUiLocale(request("https://vault.disign.me/", "ui_locale=en-US"))).toBe("en-US");
    expect(readUiLocale(request("https://vault.disign.me/?ui_locale=zh-CN", "ui_locale=en-US"))).toBe("zh-CN");
    expect(readUiLocale(request("https://vault.disign.me/?ui_locale=bad", "ui_locale=en-US"))).toBe("zh-CN");
    expect(uiLocaleCookie(request("https://vault.disign.me/?ui_locale=en-US"), "en-US"))
      .toContain("ui_locale=en-US; Path=/");
    expect(uiLocaleCookie(request("https://vault.disign.me/"), "zh-CN")).toBeNull();
    expect(localeHref(new URL("https://vault.disign.me/?q=rain&page=2"), "en-US"))
      .toBe("/?q=rain&page=2&ui_locale=en-US");
  });
});

describe("Header search scope", () => {
  it("searches within taxonomy paths and from root on Detail", () => {
    const category = renderToStaticMarkup(createElement(SiteHeader, {
      locale: "en-US", url: new URL("https://vault.disign.me/category/poster"),
      filters: filters("category=poster"),
    }));
    const detail = renderToStaticMarkup(createElement(SiteHeader, {
      locale: "en-US", url: new URL("https://vault.disign.me/prompt/poster"),
    }));
    expect(category).toContain('action="/category/poster"');
    expect(category).not.toContain('name="category" value="poster"');
    expect(detail).toContain('action="/"');
    expect(detail).not.toContain('action="/prompt/poster"');
  });
});

describe("Explore controls", () => {
  async function renderBar(query: string, locale: "zh-CN" | "en-US" = "en-US") {
    const url = new URL("https://vault.disign.me/?ui_locale=" + locale + "&" + query);
    const result = await list(query, locale);
    return renderToStaticMarkup(createElement(ExploreFiltersBar, {
      locale, filters: filters(query), categories: result.categories,
      tags: result.tags, models: result.models, ratios: result.ratios,
      total: result.total, url,
    }));
  }

  it("renders custom URL dropdowns and real type/sort tabs", async () => {
    const query = "q=rain&model=Midjourney&ratio=3%3A4&content_type=image&sort=recommended&page=2";
    const html = await renderBar(query);
    expect(html).not.toContain("<select");
    expect(html).toContain('id="explore-filter-model"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).toMatch(/aria-current="true">Images <small>/);
    expect(html).toMatch(/aria-current="true">Recommended<\/a>/);
    expect(html).toContain('disabled="" aria-disabled="true">Videos <small>0</small>');
    expect(html).toContain('disabled="" aria-disabled="true">Text <small>0</small>');
    expect(html).toContain('id="explore-filters"');
    const url = new URL("https://vault.disign.me/?ui_locale=en-US&" + query);
    for (const [key, value] of [["category", "poster"], ["tag", "cinematic"], ["model", "Flux"],
      ["ratio", "1:1"], ["source_language", "zh-CN"]]) {
      expect(html).toContain('href="' + exploreHref(url, key, value).replaceAll("&", "&amp;") + '"');
    }
    expect(html).toContain('href="' + exploreHref(url, "model", "").replaceAll("&", "&amp;") + '"');
    expect(html).toContain('href="' + exploreHref(url, "sort", "popular").replaceAll("&", "&amp;") + '"');
  });

  it("restores all content and sort active states in SSR markup", async () => {
    for (const contentType of ["all", "image"]) {
      for (const sort of ["recommended", "popular", "latest"]) {
        const html = await renderBar("content_type=" + contentType + "&sort=" + sort);
        const contentLabel = contentType === "all" ? "All" : "Images";
        const sortLabel = { recommended: "Recommended", popular: "Popular", latest: "Newest" }[sort];
        expect(html).toContain('aria-current="true">' + contentLabel + ' <small>');
        expect(html).toContain('aria-current="true">' + sortLabel + '</a>');
      }
    }
  });

  it("keeps Chinese and English labels and preserves new state in search", async () => {
    const zh = await renderBar("content_type=image&sort=popular", "zh-CN");
    const en = await renderBar("content_type=image&sort=popular");
    for (const label of ["模型", "风格分类", "画幅比例", "Prompt 语言", "标签", "热门"]) {
      expect(zh).toContain(label);
    }
    for (const label of ["Model", "Style category", "Aspect ratio", "Prompt language", "Tags", "Popular"]) {
      expect(en).toContain(label);
    }
    const header = renderToStaticMarkup(createElement(SiteHeader, {
      locale: "en-US", filters: filters("q=rain&content_type=image&sort=popular"),
      url: new URL("https://vault.disign.me/?ui_locale=en-US&q=rain&content_type=image&sort=popular"),
    }));
    expect(header).toContain('name="content_type" value="image"');
    expect(header).toContain('name="sort" value="popular"');
    expect(header).toContain('href="/?ui_locale=en-US&amp;q=rain&amp;content_type=image&amp;sort=popular#explore-filters"');
  });
});
