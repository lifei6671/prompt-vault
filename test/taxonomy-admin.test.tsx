import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import routes from "../app/routes";
import { loader as categoryLoader } from "../app/routes/admin-categories";
import { loader as tagLoader } from "../app/routes/admin-tags";
import TaxonomyAdminPage from "../app/routes/taxonomy-admin";
import { taxonomyAdminAction } from "../app/routes/taxonomy-admin.server";
import { listTaxonomyAdmin, mutateTaxonomyAdmin, type TaxonomyKind } from "../app/services/taxonomy-admin.server";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) await env.DB.prepare(statement).run();
}

beforeAll(async () => {
  await applyMigration(migration1);
  await applyMigration(migration2);
  await applyMigration(migration4);
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function createFields(kind: TaxonomyKind, slug: string, overrides: Record<string, string> = {}) {
  return form({
    _intent: "create", slug, source_language: "zh-CN", name: "原文",
    translation_name: "Translation",
    ...(kind === "category" ? {
      description: "原文描述", sort_order: "5", translation_description: "Translated description",
    } : {}), ...overrides,
  });
}

function updateFields(kind: TaxonomyKind, id: number, overrides: Record<string, string> = {}) {
  return form({
    _intent: "update", id: String(id), name: "修改后的原文",
    translation_locale: "en-US", translation_name: "Updated translation",
    ...(kind === "category" ? {
      description: "新描述", sort_order: "-2", translation_description: "New translated description",
    } : {}), ...overrides,
  });
}

async function row(kind: TaxonomyKind, slug: string) {
  return (await listTaxonomyAdmin(env.DB, kind)).find((item) => item.slug === slug);
}

async function expectError(kind: TaxonomyKind, data: FormData, status: number) {
  await expect(mutateTaxonomyAdmin(env.DB, kind, data)).rejects.toMatchObject({ status });
}

describe("Category and Tag admin CRUD", () => {
  it("creates source and complete translation rows, including an empty translated description", async () => {
    await mutateTaxonomyAdmin(env.DB, "category", createFields("category", "admin-category",
      { translation_description: "" }));
    const category = await row("category", "admin-category");
    expect(category).toMatchObject({
      source_language: "zh-CN", name: "原文", description: "原文描述",
      sort_order: 5, translation_name: "Translation", translation_description: null,
    });
    const translation = await env.DB.prepare("SELECT locale, name, description FROM category_translations WHERE category_id = ?")
      .bind(category!.id).first();
    expect(translation).toEqual({ locale: "en-US", name: "Translation", description: null });

    await mutateTaxonomyAdmin(env.DB, "tag", createFields("tag", "admin-tag", {
      source_language: "en-US", name: "Original",
      translation_name: "译名",
    }));
    expect(await row("tag", "admin-tag")).toMatchObject({
      source_language: "en-US", name: "Original", translation_name: "译名",
    });
  });

  it("creates source-only rows and updates source and translation in one batch", async () => {
    for (const kind of ["category", "tag"] as const) {
      await mutateTaxonomyAdmin(env.DB, kind, createFields(kind, `english-source-only-${kind}`, {
        source_language: "en-US", translation_name: "",
      }));
      expect(await row(kind, `english-source-only-${kind}`)).toMatchObject({
        source_language: "en-US", translation_name: null,
      });
      const slug = `source-only-${kind}`;
      await mutateTaxonomyAdmin(env.DB, kind, createFields(kind, slug, {
        translation_name: "", ...(kind === "category" ? { translation_description: "" } : {}),
      }));
      const original = await row(kind, slug);
      expect(original?.translation_name).toBeNull();
      await mutateTaxonomyAdmin(env.DB, kind, updateFields(kind, original!.id));
      expect(await row(kind, slug)).toMatchObject({
        name: "修改后的原文", translation_name: "Updated translation",
        ...(kind === "category" ? {
          description: "新描述", sort_order: -2, translation_description: "New translated description",
        } : {}),
      });
      await mutateTaxonomyAdmin(env.DB, kind, updateFields(kind, original!.id, {
        translation_name: "",
      }));
      expect((await row(kind, slug))?.translation_name).toBeNull();
    }
  });

  it("rejects invalid intent, ids, locale, slug, names, descriptions and immutable identity changes", async () => {
    const category = (await row("category", "admin-category"))!;
    for (const fields of [
      { _intent: "publish" }, { slug: "Bad Slug" }, { slug: "" },
      { source_language: "fr-FR" }, { translation_locale: "zh-CN" },
      { name: "   " }, { name: "x".repeat(121) },
      { description: "x".repeat(1001) }, { sort_order: "1.5" },
      { sort_order: "1000001" },
    ]) {
      await expectError("category", createFields("category", "invalid-check", fields), 400);
    }
    const missingLocale = createFields("category", "missing-language");
    missingLocale.delete("source_language");
    await expectError("category", missingLocale, 400);
    for (const id of ["0", "-1", "abc", "9007199254740992"]) {
      await expectError("category", updateFields("category", category.id, { id }), 400);
    }
    await expectError("category", updateFields("category", category.id, { slug: "changed" }), 400);
    await expectError("category", updateFields("category", category.id, { source_language: "en-US" }), 400);
    await expectError("category", updateFields("category", category.id, { translation_locale: "zh-CN" }), 400);
    expect((await row("category", "admin-category"))?.source_language).toBe("zh-CN");
  });

  it("maps duplicate slugs to a safe conflict and returns 404 for missing ids", async () => {
    await expectError("category", createFields("category", "admin-category"), 409);
    await expectError("tag", createFields("tag", "admin-tag"), 409);
    await expectError("category", updateFields("category", 999999), 404);
    await expectError("tag", form({ _intent: "delete", id: "999999" }), 404);
  });

  it("blocks referenced deletion and removes unreferenced parents with translations", async () => {
    const category = (await row("category", "admin-category"))!;
    const tag = (await row("tag", "admin-tag"))!;
    await env.DB.prepare(`INSERT INTO prompts
      (slug, title, prompt_template, category_id, original_image_key,
       preview_image_key, original_content_type, original_width, original_height,
       preview_width, preview_height, original_size_bytes, preview_size_bytes,
       image_alt, status, created_at, updated_at)
      VALUES ('admin-prompt', 'Title', 'Body', ?, 'original.png', 'preview.webp',
        'image/png', 400, 600, 200, 300, 100, 50, 'Alt', 'draft', 'now', 'now')`)
      .bind(category.id).run();
    const prompt = await env.DB.prepare("SELECT id FROM prompts WHERE slug = 'admin-prompt'").first<{ id: number }>();
    await env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)")
      .bind(prompt!.id, tag.id).run();
    await expectError("category", form({ _intent: "delete", id: String(category.id) }), 409);
    await expectError("tag", form({ _intent: "delete", id: String(tag.id) }), 409);
    expect(await row("category", "admin-category")).toBeDefined();
    expect(await row("tag", "admin-tag")).toBeDefined();

    for (const kind of ["category", "tag"] as const) {
      const slug = `delete-${kind}`;
      await mutateTaxonomyAdmin(env.DB, kind, createFields(kind, slug));
      const item = (await row(kind, slug))!;
      await mutateTaxonomyAdmin(env.DB, kind, form({ _intent: "delete", id: String(item.id) }));
      expect(await row(kind, item.slug)).toBeUndefined();
      const table = kind === "category" ? "category_translations" : "tag_translations";
      const key = kind === "category" ? "category_id" : "tag_id";
      expect(await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${key} = ?`).bind(item.id).first()).toBeNull();
    }
  });

  it("uses D1 batch so a later failure rolls back parent and translation", async () => {
    const db = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => env.DB.batch([
        ...statements, env.DB.prepare("INSERT INTO category_translations (category_id, locale, name) VALUES (999999, 'en-US', 'fail')"),
      ]),
    } as unknown as D1Database;
    await expect(mutateTaxonomyAdmin(db, "category", createFields("category", "rollback-check")))
      .rejects.toThrow();
    expect(await row("category", "rollback-check")).toBeUndefined();
  });

  it("registers protected child routes, renders SSR list and uses no-store PRG", async () => {
    const admin = routes.find((route) => route.path === "admin");
    expect(admin?.children?.map((child) => child.path)).toContain("categories");
    expect(admin?.children?.map((child) => child.path)).toContain("tags");
    const categoryPage = await categoryLoader();
    const tagPage = await tagLoader();
    expect(categoryPage.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    expect(tagPage.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const items = categoryPage.data.items;
    const router = createMemoryRouter([{
      path: "/", element: createElement(Outlet, { context: "en-US" }),
      children: [{ index: true, element: createElement(TaxonomyAdminPage, {
        kind: "category", items,
      }) }],
    }]);
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html).toContain("admin-category");
    expect(html).toContain("Translation");
    expect(html).toContain("en-US");
    const result = await taxonomyAdminAction(
      new Request("https://vault.disign.me/admin/tags?ui_locale=en-US", {
        method: "POST", body: new URLSearchParams({
          _intent: "create", slug: "action-tag", source_language: "en-US", name: "Action tag",
          translation_name: "",
        }),
      }), env.DB, "tag",
    );
    expect(result.status).toBe(303);
    expect(await row("tag", "action-tag")).toMatchObject({
      source_language: "en-US", name: "Action tag", translation_name: null,
    });
    expect(result.headers.get("Location")).toBe("/admin/tags?ui_locale=en-US");
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    const invalid = await taxonomyAdminAction(
      new Request("https://vault.disign.me/admin/tags", {
        method: "POST", body: new URLSearchParams({ _intent: "wrong" }),
      }), env.DB, "tag",
    );
    expect(invalid.init?.status).toBe(400);
    expect(invalid.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
  });
  it("reports referenced Prompt counts and renders bilingual compact taxonomy rows", async () => {
    const category = (await row("category", "admin-category"))!;
    const tag = (await row("tag", "admin-tag"))!;
    expect(category.prompt_count).toBe(1);
    expect(tag.prompt_count).toBe(1);
    expect(category.updated_at).toBeTruthy();
    const prompt = await env.DB.prepare("SELECT id FROM prompts WHERE slug = 'admin-prompt'").first<{ id: number }>();
    await env.DB.prepare("UPDATE prompts SET deleted_at = 'now' WHERE id = ?").bind(prompt!.id).run();
    expect((await row("category", "admin-category"))?.prompt_count).toBe(1);
    expect((await row("tag", "admin-tag"))?.prompt_count).toBe(1);
    for (const kind of ["category", "tag"] as const) {
      const items = await listTaxonomyAdmin(env.DB, kind);
      for (const locale of ["zh-CN", "en-US"] as const) {
        const router = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: locale }),
          children: [{ index: true, element: createElement(TaxonomyAdminPage, { kind, items }) }] }]);
        const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
        expect(html).toContain('admin-taxonomy-table');
        expect(html).toContain('admin-taxonomy-compact');
        expect(html).toContain(locale === "zh-CN" ? "Prompt 数" : "Prompts");
        expect(html).toContain('name="source_language"');
        expect(html).toContain('name="translation_name"');
      }
    }
  });});








