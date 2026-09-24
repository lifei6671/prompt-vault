import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import AdminLayout, { headers as parentHeaders, middleware } from "../app/routes/admin";
import AdminPrompts, { loader as listLoader } from "../app/routes/admin-prompts";
import { loader as indexLoader } from "../app/routes/admin-index";
import { getAdminNavCounts, getAdminPromptSummary, queryAdminPrompts,
  readAdminListFilters } from "../app/services/admin-list.server";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";

async function migrate(sql: string) {
  for (const statement of sql.split(";").map((part) => part.replace(/^--.*$/gm, "").trim()).filter(Boolean))
    await env.DB.prepare(statement).run();
}

beforeAll(async () => {
  await migrate(migration1);
  await migrate(migration2);
  await migrate(migration4);
  await env.DB.prepare("INSERT INTO categories (id,name,slug,created_at,updated_at) VALUES (1,'摄影','photo','now','now'),(2,'设计','design','now','now')").run();
  await env.DB.prepare("INSERT INTO tags (id,name,slug,created_at,updated_at) VALUES (1,'风格','style','now','now')").run();
  for (let i = 1; i <= 26; i++) {
    const slug = i === 1 ? "special-percent" : "entry-" + i;
    const title = i === 1 ? "Special_% title" : "Title " + i;
    const status = i % 2 === 0 ? "published" : "draft";
    await env.DB.prepare("INSERT INTO prompts (slug,title,description,prompt_template,model,ratio,category_id,original_image_key,preview_image_key,original_content_type,original_width,original_height,preview_width,preview_height,original_size_bytes,preview_size_bytes,image_alt,status,source_language,deleted_at,created_at,updated_at) VALUES (?,?,?,'body',?,?,?,'original.png','preview.webp','image/png',800,600,400,300,100,50,'image',?,'zh-CN',?,'2026-09-23T00:00:00Z','2026-09-23T00:00:00Z')")
      .bind(slug, title, "Description " + i, i % 3 === 0 ? "Flux" : "Midjourney",
        i % 2 === 0 ? "4:3" : "1:1", i <= 13 ? 1 : 2, status,
        i === 26 ? "2026-09-23T01:00:00Z" : null).run();
  }
});

const filters = (query = "") => readAdminListFilters(new URLSearchParams(query));
const request = (query = "") => new Request("https://vault.disign.me/admin/prompts" + query);
const load = (query = "") => listLoader({ request: request(query) } as Parameters<typeof listLoader>[0]);

function render(locale: "zh-CN" | "en-US", query = "") {
  return load(query).then((result) => {
    const router = createMemoryRouter([{ path: "/admin", element: createElement(AdminLayout, {
      loaderData: { locale, counts: { prompts: 26, categories: 2, tags: 1 } },
    } as Parameters<typeof AdminLayout>[0]), children: [
      { path: "prompts", element: createElement(AdminPrompts, {
        loaderData: result.data,
      } as Parameters<typeof AdminPrompts>[0]) },
    ] }], { initialEntries: ["/admin/prompts" + query] });
    return renderToStaticMarkup(createElement(RouterProvider, { router }));
  });
}

describe("Admin Phase A list", () => {
  it("keeps the parent route redirect and no-store", async () => {
    expect(middleware).toHaveLength(1);
    expect(parentHeaders({} as Parameters<typeof parentHeaders>[0])).toEqual({ "Cache-Control": "no-store" });
    const response = indexLoader();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/prompts");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await load()).init?.headers).toMatchObject({ "Cache-Control": "no-store" });
  });

  it("loads real navigation and lifecycle counts", async () => {
    expect(await getAdminNavCounts(env.DB)).toEqual({ prompts: 26, categories: 2, tags: 1 });
    expect(await getAdminPromptSummary(env.DB)).toEqual({
      total: 26, draft: 13, published: 12, deleted: 1,
    });
  });

  it("trims and limits search, whitelists status and filter syntax", () => {
    expect(filters("q=%20%20Title%20%20&status=bad&category=bad!&model=bad%25&ratio=oops%5C&page=-3"))
      .toMatchObject({ q: "Title", status: "all", category: "", model: "bad%", ratio: "oops\\", page: 1 });
    expect(filters("q=" + "x".repeat(150)).q).toHaveLength(100);
    expect(filters("status=deleted&category=photo&model=Flux&ratio=4%3A3&page=2"))
      .toMatchObject({ status: "deleted", category: "photo", model: "Flux", ratio: "4:3", page: 2 });
  });

  it("filters title or slug literally, each field, and combined fields", async () => {
    const q = (query: string) => queryAdminPrompts(env.DB, filters(query));
    expect((await q("q=Special_%25")).items.map((row) => row.slug)).toEqual(["special-percent"]);
    expect((await q("q=entry-3")).items.map((row) => row.slug)).toContain("entry-3");
    expect((await q("status=draft")).total).toBe(13);
    expect((await q("status=published")).total).toBe(12);
    expect((await q("status=deleted")).items.map((row) => row.slug)).toEqual(["entry-26"]);
    expect((await q("category=photo")).total).toBe(13);
    expect((await q("model=Flux")).total).toBe(8);
    expect((await q("ratio=1%3A1")).total).toBe(13);
    const combined = await q("status=published&category=photo&model=Flux&ratio=4%3A3");
    expect(combined.items.map((row) => row.slug)).toEqual(["entry-12", "entry-6"]);
    expect((await q("q=Title%2012&status=published&category=photo&model=Flux&ratio=4%3A3")).items.map((row) => row.slug)).toEqual(["entry-12"]);
    expect((await load("?model=missing")).data.filters.model).toBe("");
    expect((await load("?model=bad%25&ratio=bad%25")).data.filters).toMatchObject({ model: "", ratio: "" });
  });

  it("orders by updated time and id, paginates 20 items, and clamps oversized pages", async () => {
    const first = await queryAdminPrompts(env.DB, filters());
    expect(first).toMatchObject({ total: 26, page: 1, pages: 2 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0].slug).toBe("entry-26");
    const second = await queryAdminPrompts(env.DB, filters("page=2"));
    expect(second.items).toHaveLength(6);
    expect(second.items[0].slug).toBe("entry-6");
    expect((await queryAdminPrompts(env.DB, filters("page=999"))).page).toBe(2);
    expect(first.items[0]).toMatchObject({
      preview_image_key: "preview.webp", preview_width: 400, preview_height: 300,
      title: "Title 26", description: "Description 26", category_name: "设计",
    });
  });

  it("renders bilingual shell, desktop table, compact rows, and deleted read-only links", async () => {
    const zh = await render("zh-CN", "?status=deleted");
    expect(zh).toContain("PromptVault Admin");
    expect(zh).toContain("打开后台菜单");
    expect(zh).toContain("后台导航");
    expect(zh).toContain("26</span>");
    expect(zh).toContain("Prompt 管理");
    expect(zh).toContain("<table");
    expect(zh).toContain("admin-compact-row");
    expect(zh).toContain("entry-26");
    expect(zh).toContain("/admin/prompts/26/edit");
    expect(zh).toContain("查看（只读）");
    expect(zh).not.toContain("/admin/prompts/26/preview");
    expect(zh).not.toContain("Restore");
    const en = await render("en-US", "?status=published");
    expect(en).toContain("Prompt management");
    expect(en).toContain("Open admin menu");
    expect(en).toContain("Showing");
    expect(en).toContain("Preview");
    expect(en).toContain("Category");
    expect(en).toContain('name="status" value="published"');
    expect(en).toContain('class="pv-select-trigger"');
    expect(en).not.toContain("<select");

    expect(zh).toContain("admin-mobile-drawer");
    expect(zh).toContain("admin-mobile-create admin-primary-action");
  });
});
