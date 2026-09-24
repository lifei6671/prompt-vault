import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import routes from "../app/routes";
import AdminPromptEdit, { action, loader } from "../app/routes/admin-prompt-edit";
import AdminPrompts, { loader as listLoader } from "../app/routes/admin-prompts";
import { getPromptDetail } from "../app/services/prompt-detail.server";
import { getAdminPrompt, listAdminPrompts, listPromptTaxonomy, mutateAdminPrompt, parseVariables } from "../app/services/prompt-admin.server";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";

async function migrate(sql: string) {
  for (const statement of sql.split(";").map((part) => part.replace(/^--.*$/gm, "").trim()).filter(Boolean))
    await env.DB.prepare(statement).run();
}
beforeAll(async () => {
  await migrate(migration1);
  await migrate(migration2);
  await env.DB.prepare("INSERT INTO categories (id,name,slug,created_at,updated_at) VALUES (1,'分类','category','now','now')")
    .run();
  await env.DB.prepare("INSERT INTO tags (id,name,slug,created_at,updated_at) VALUES (1,'标签一','tag-one','now','now'),(2,'标签二','tag-two','now','now')")
    .run();
});
async function create(slug: string, status: "draft" | "published" = "draft", source = "zh-CN") {
  await env.DB.prepare(`INSERT INTO prompts
    (slug,title,prompt_template,category_id,original_image_key,preview_image_key,
     original_content_type,original_width,original_height,preview_width,preview_height,
     original_size_bytes,preview_size_bytes,image_alt,status,source_language,published_at,
     created_at,updated_at)
    VALUES (?, '原文标题', '正文', 1, 'original.png', 'preview.webp',
      'image/png', 800, 600, 400, 300, 100, 50, '图片', ?, ?, ?, 'now', 'now')`)
    .bind(slug, status, source, status === "published" ? "2020-01-01T00:00:00.000Z" : null).run();
  return (await env.DB.prepare("SELECT id FROM prompts WHERE slug = ?").bind(slug).first<{ id: number }>())!.id;
}
function form(slug: string, overrides: Record<string, string> = {}, tags: string[] = []) {
  const result = new FormData();
  const values = {
    _intent: "save", slug, title: "原文标题", description: "", prompt_template: "正文",
    image_alt: "图片", model: "Flux", ratio: "4:3", category_id: "1",
    translation_locale: "en-US", translation_mode: "remove",
    translation_title: "", translation_description: "", translation_prompt_template: "",
    translation_image_alt: "", variables_json: "[]", ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => result.set(key, value));
  tags.forEach((tag) => result.append("tag_ids", tag));
  return result;
}
function intent(actionName: string) {
  const result = new FormData();
  result.set("_intent", actionName);
  return result;
}
const prompt = (id: number) => getAdminPrompt(env.DB, id);
const reject = (id: number, data: FormData, status: number) =>
  expect(mutateAdminPrompt(env.DB, id, data)).rejects.toMatchObject({ status });
const textVariable = { key: "city", type: "text", label: "城市", placeholder: null,
  translation_label: "City", translation_placeholder: null, options: null };
const selectVariable = { key: "style", type: "select", label: "风格", placeholder: null,
  translation_label: null, translation_placeholder: null,
  options: [{ value: "retro", labels: { "zh-CN": "复古", "en-US": "Retro" } }] };

describe("Prompt admin", () => {
  it("lists draft, published and deleted records with source metadata", async () => {
    const draft = await create("list-draft");
    const published = await create("list-published", "published");
    const deleted = await create("list-deleted");
    await mutateAdminPrompt(env.DB, deleted, intent("delete"));
    const rows = await listAdminPrompts(env.DB);
    expect(rows.find((row) => row.id === draft)).toMatchObject({
      slug: "list-draft", status: "draft", category_name: "分类", deleted_at: null,
    });
    expect(rows.find((row) => row.id === published)).toMatchObject({
      status: "published", published_at: "2020-01-01T00:00:00.000Z",
    });
    expect(rows.find((row) => row.id === deleted)?.deleted_at).not.toBeNull();
    expect((await listLoader({ request: new Request("https://vault.disign.me/admin/prompts") } as Parameters<typeof listLoader>[0])).init?.headers).toMatchObject({ "Cache-Control": "no-store" });
  });

  it("allows slug edits before first publish, then freezes it after publish and withdraw", async () => {
    const id = await create("slug-draft");
    await mutateAdminPrompt(env.DB, id, form("slug-before-publish"));
    expect((await prompt(id)).slug).toBe("slug-before-publish");
    await mutateAdminPrompt(env.DB, id, intent("publish"));
    const first = (await prompt(id)).published_at;
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    await reject(id, form("slug-after-publish"), 409);
    await mutateAdminPrompt(env.DB, id, intent("withdraw"));
    expect((await prompt(id)).published_at).toBe(first);
    await reject(id, form("slug-after-withdraw"), 409);
    await mutateAdminPrompt(env.DB, id, intent("publish"));
    expect((await prompt(id)).published_at).toBe(first);
    expect((await prompt(id)).status).toBe("published");
  });

  it("rejects source language and image identity edits", async () => {
    const id = await create("immutable-fields");
    await reject(id, form("immutable-fields", { source_language: "en-US" }), 400);
    await reject(id, form("immutable-fields", { original_image_key: "other.png" }), 400);
    expect((await prompt(id)).source_language).toBe("zh-CN");
  });

  it("saves complete translations and deletes only when explicitly cleared", async () => {
    const id = await create("translation-row");
    await reject(id, form("translation-row", { translation_mode: "present", translation_title: "Title" }), 400);
    await mutateAdminPrompt(env.DB, id, form("translation-row", {
      translation_mode: "present", translation_title: "Title", translation_prompt_template: "\nBody\n",
      translation_image_alt: "Alt",
    }));
    expect((await prompt(id)).translation).toMatchObject({
      locale: "en-US", title: "Title", description: null, prompt_template: "\nBody\n", image_alt: "Alt",
    });
    await mutateAdminPrompt(env.DB, id, form("translation-row", { translation_mode: "remove" }));
    expect((await prompt(id)).translation).toBeNull();
    const english = await create("english-source", "draft", "en-US");
    await mutateAdminPrompt(env.DB, english, form("english-source", {
      translation_locale: "zh-CN", translation_mode: "present", translation_title: "中文",
      translation_prompt_template: "正文", translation_image_alt: "图片",
    }));
    expect((await prompt(english)).translation?.locale).toBe("zh-CN");
  });

  it("validates text and select variables and stable options", async () => {
    expect(parseVariables(JSON.stringify([textVariable, selectVariable]), "zh-CN")).toHaveLength(2);
    for (const bad of [
      [{ ...textVariable, key: "Bad" }],
      [textVariable, textVariable],
      [{ ...textVariable, options: [] }],
      [{ ...selectVariable, options: [] }],
      [{ ...selectVariable, options: [{ value: "retro", labels: { "zh-CN": "复古" } },
        { value: "retro", labels: { "zh-CN": "重复" } }] }],
      [{ ...selectVariable, options: [{ value: "retro", labels: { "en-US": "Retro" } }] }],
    ]) expect(() => parseVariables(JSON.stringify(bad), "zh-CN")).toThrow();
    const id = await create("variable-save");
    await mutateAdminPrompt(env.DB, id, form("variable-save", {
      prompt_template: "{{city}} {{city}} {{style}}",
      variables_json: JSON.stringify([textVariable, selectVariable]),
    }));
    expect((await prompt(id)).variables).toMatchObject([textVariable, selectVariable]);
    await mutateAdminPrompt(env.DB, id, intent("publish"));
  });

  it("refuses missing, extra and translated token keys on save and publish", async () => {
    const id = await create("token-check");
    await reject(id, form("token-check", { prompt_template: "{{city}}" }), 400);
    await reject(id, form("token-check", { variables_json: JSON.stringify([textVariable]) }), 400);
    await reject(id, form("token-check", {
      prompt_template: "{{city}}", variables_json: JSON.stringify([textVariable]),
      translation_mode: "present", translation_title: "Title",
      translation_prompt_template: "{{other}}", translation_image_alt: "Alt",
    }), 400);
    await env.DB.prepare("UPDATE prompts SET prompt_template = '{{missing}}' WHERE id = ?").bind(id).run();
    await reject(id, intent("publish"), 400);
    expect((await prompt(id)).status).toBe("draft");
  });

  it("refuses malformed stored variable options on publish", async () => {
    const id = await create("invalid-stored-options");
    await env.DB.prepare(`INSERT INTO prompt_variables
      (prompt_id,variable_key,label,input_type,options_json,created_at,updated_at)
      VALUES (?,'city','城市','text','[]','now','now')`).bind(id).run();
    await env.DB.prepare("UPDATE prompts SET prompt_template = '{{city}}' WHERE id = ?").bind(id).run();
    await reject(id, intent("publish"), 400);
    expect((await env.DB.prepare("SELECT status FROM prompts WHERE id = ?")
      .bind(id).first<{ status: string }>())?.status).toBe("draft");
  });

  it("requires existing category and tags, and deduplicates tag ids", async () => {
    const id = await create("taxonomy-check");
    await reject(id, form("taxonomy-check", { category_id: "99999" }), 409);
    await reject(id, form("taxonomy-check", {}, ["99999"]), 409);
    await reject(id, form("taxonomy-check", { category_id: "bad" }), 400);
    await mutateAdminPrompt(env.DB, id, form("taxonomy-check", {}, ["1", "1", "2"]));
    expect((await prompt(id)).tagIds).toEqual([1, 2]);
  });

  it("uses one batch and rolls back a later statement failure", async () => {
    const id = await create("atomic-edit");
    let calls = 0;
    const db = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => {
        calls += 1;
        return env.DB.batch([...statements,
          env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)").bind(id, 99999)]);
      },
    } as unknown as D1Database;
    await expect(mutateAdminPrompt(db, id, form("atomic-edited", { title: "Changed" }, ["1"]))).rejects.toThrow();
    expect(calls).toBe(1);
    expect((await prompt(id))).toMatchObject({ slug: "atomic-edit", title: "原文标题", tagIds: [] });
  });

  it("rejects a save when publish or delete wins before its batch", async () => {
    for (const race of ["publish", "delete"] as const) {
      const id = await create("race-" + race);
      const db = {
        prepare: (sql: string) => env.DB.prepare(sql),
        batch: async (statements: D1PreparedStatement[]) => {
          if (race === "publish")
            await env.DB.prepare("UPDATE prompts SET status = 'published', published_at = ? WHERE id = ?")
              .bind("2024-01-01T00:00:00.000Z", id).run();
          else
            await env.DB.prepare("UPDATE prompts SET deleted_at = ? WHERE id = ?")
              .bind("2024-01-01T00:00:00.000Z", id).run();
          return env.DB.batch(statements);
        },
      } as unknown as D1Database;
      await expect(mutateAdminPrompt(db, id, form("race-" + race + "-changed", {
        title: "Must not save",
      }, ["1"]))).rejects.toMatchObject({ status: 409 });
      expect((await prompt(id))).toMatchObject({
        slug: "race-" + race, title: "原文标题", tagIds: [],
      });
    }
  });

  it("soft deletes, keeps public 410 and rejects all later writes", async () => {
    const id = await create("soft-deleted", "published");
    await mutateAdminPrompt(env.DB, id, intent("delete"));
    await expect(getPromptDetail(env.DB, "soft-deleted", "zh-CN", null))
      .rejects.toMatchObject({ status: 410 });
    for (const data of [form("soft-deleted"), intent("publish"), intent("withdraw"), intent("delete")])
      await reject(id, data, 409);
  });

  it("renders the edit form and list in both admin locales", async () => {
    const id = await create("render-admin");
    const detail = { prompt: await prompt(id), taxonomy: await listPromptTaxonomy(env.DB) };
    for (const locale of ["zh-CN", "en-US"] as const) {
      const editRouter = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: locale }),
        children: [{ index: true, element: createElement(AdminPromptEdit, {
          loaderData: detail, actionData: undefined,
        } as Parameters<typeof AdminPromptEdit>[0]) }] }]);
      const editHtml = renderToStaticMarkup(createElement(RouterProvider, { router: editRouter }));
      expect(editHtml).toContain(locale === "zh-CN" ? "Prompt 正文" : "Prompt body");
      expect(editHtml).toContain("original.png");
      expect(editHtml).toContain("variables_json");
      expect(editHtml).toContain("admin-editor-layout");
      expect(editHtml).toContain("admin-editor-side");
      expect(editHtml).toContain('name="_intent" value="publish"');
      expect(editHtml).toContain(locale === "zh-CN" ? "已保存内容校验" : "Saved content checks");
      expect(editHtml).toContain(`/admin/prompts/${id}/preview?ui_locale=${locale}`);
      expect(editHtml).toContain(locale === "zh-CN" ? ">预览</a>" : ">Preview</a>");
      expect(editHtml).toContain("en-US");
      const listRouter = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: locale }),
        children: [{ index: true, element: createElement(AdminPrompts, {
          loaderData: (await listLoader({ request: new Request("https://vault.disign.me/admin/prompts") } as Parameters<typeof listLoader>[0])).data,
        } as Parameters<typeof AdminPrompts>[0]) }] }]);
      const listHtml = renderToStaticMarkup(createElement(RouterProvider, { router: listRouter }));
      expect(listHtml).toContain("render-admin");
    }
    await mutateAdminPrompt(env.DB, id, intent("delete"));
    const deletedRouter = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: "zh-CN" }),
      children: [{ index: true, element: createElement(AdminPromptEdit, {
        loaderData: { prompt: await prompt(id), taxonomy: await listPromptTaxonomy(env.DB) },
        actionData: undefined,
      } as Parameters<typeof AdminPromptEdit>[0]) }] }]);
    const deletedHtml = renderToStaticMarkup(createElement(RouterProvider, { router: deletedRouter }));
    expect(deletedHtml).not.toContain(`/admin/prompts/${id}/preview`);
    expect(deletedHtml).not.toContain('name="_intent" value="publish"');
    expect(deletedHtml).not.toContain('name="_intent" value="replace_image"');
    expect(deletedHtml).toContain('disabled=""');
  });

  it("derives saved content checks from stored template keys", async () => {
    const id = await create("check-real-data");
    await env.DB.prepare("UPDATE prompts SET prompt_template = '{{missing}}' WHERE id = ?").bind(id).run();
    const router = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: "en-US" }),
      children: [{ index: true, element: createElement(AdminPromptEdit, {
        loaderData: { prompt: await prompt(id), taxonomy: await listPromptTaxonomy(env.DB) },
        actionData: undefined,
      } as Parameters<typeof AdminPromptEdit>[0]) }] }]);
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html).toContain("Variables match template");
    expect(html).toContain("Check</strong>");
    expect(html).toContain("Pass</strong>");
  });
  it("maps action errors to 400/404/409 with no-store under the admin parent", async () => {
    const id = await create("action-check");
    const admin = routes.find((route) => route.path === "admin");
    expect(admin?.children?.map((child) => child.path)).toEqual(expect.arrayContaining([
      "prompts", "prompts/:id/edit", "categories", "tags",
    ]));
    expect(routes.some((route) => route.path === "prompt/:slug")).toBe(true);
    const list = await loader({ params: { id: String(id) } } as Parameters<typeof loader>[0]);
    expect(list.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const request = (path: string, body: FormData) => new Request("https://vault.disign.me" + path,
      { method: "POST", body });
    const invalid = await action({ params: { id: "bad" },
      request: request("/admin/prompts/bad/edit", intent("publish")) } as Parameters<typeof action>[0]);
    expect(invalid.init?.status).toBe(400);
    expect(invalid.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const missing = await action({ params: { id: "999999" },
      request: request("/admin/prompts/999999/edit", intent("publish")) } as Parameters<typeof action>[0]);
    expect(missing.init?.status).toBe(404);
    const conflict = await action({ params: { id: String(id) },
      request: request(`/admin/prompts/${id}/edit`, form("list-draft")) } as Parameters<typeof action>[0]);
    expect(conflict.init?.status).toBe(409);
    const saved = await action({ params: { id: String(id) },
      request: request("/admin/prompts/" + id + "/edit", form("action-check")) } as Parameters<typeof action>[0]);
    expect(saved.status).toBe(303);
    expect(saved.headers.get("Cache-Control")).toBe("no-store");
  });
});
