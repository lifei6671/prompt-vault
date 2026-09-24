import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import routes from "../app/routes";
import AdminPromptPreview, { headers, loader, meta } from "../app/routes/admin-prompt-preview";
import { documentLanguage } from "../app/root";
import { getPromptDetail } from "../app/services/prompt-detail.server";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";

async function migrate(sql: string) {
  for (const statement of sql.split(";").map((part) => part.replace(/^--.*$/gm, "").trim()).filter(Boolean))
    await env.DB.prepare(statement).run();
}
const request = (id: number | string, query = "") => new Request(
  `https://vault.disign.me/admin/prompts/${id}/preview${query}`,
);
const load = (id: number | string, query = "") => loader({
  request: request(id, query), params: { id: String(id) },
} as Parameters<typeof loader>[0]);

beforeAll(async () => {
  await migrate(migration1);
  await migrate(migration2);
  await migrate(migration4);
  await env.DB.prepare("INSERT INTO categories (id,name,slug,created_at,updated_at) VALUES (1,'海报','poster','now','now')").run();
  const insert = env.DB.prepare(`INSERT INTO prompts
    (id,slug,title,description,prompt_template,category_id,
     original_image_key,preview_image_key,original_content_type,original_width,
     original_height,preview_width,preview_height,original_size_bytes,
     preview_size_bytes,image_alt,status,published_at,created_at,updated_at)
    VALUES (?,?,?,?,?,1,'original/poster 1.png','preview/poster.webp',
      'image/png',800,1200,400,600,100,50,?,?,'now','now','now')`);
  await insert.bind(1, "preview-draft", "草稿标题", "草稿描述",
    "画{{city}}，{{city}}，{{style}}", "草稿图片", "draft").run();
  await insert.bind(2, "preview-published", "已发布标题", null,
    "直接复制正文", "已发布图片", "published").run();
  await insert.bind(3, "preview-deleted", "已删除标题", null,
    "不能预览正文", "已删除图片", "published").run();
  await env.DB.prepare("UPDATE prompts SET requires_reference_image = 1 WHERE id = 1").run();
  await env.DB.prepare("UPDATE prompts SET deleted_at='now' WHERE id=3").run();
  await env.DB.prepare(`INSERT INTO prompt_translations
    (prompt_id,locale,title,description,prompt_template,image_alt)
    VALUES (1,'en-US','Draft title','Draft description',
      'Paint {{city}}, {{city}}, {{style}}','Draft image')`).run();
  const variable = env.DB.prepare(`INSERT INTO prompt_variables
    (id,prompt_id,variable_key,label,input_type,input_placeholder,options_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'now','now')`);
  await variable.bind(1, 1, "city", "城市", "text", "输入城市", null).run();
  await variable.bind(2, 1, "style", "风格", "select", null,
    JSON.stringify([{ value: "retro", labels: { "zh-CN": "复古", "en-US": "Retro" } }])).run();
});

describe("Admin Prompt Preview", () => {
  it("renders draft SSR with the shared Detail and variable controls while public Detail stays 404", async () => {
    const result = await load(1, "?ui_locale=zh-CN");
    expect(result.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const html = renderToStaticMarkup(createElement(AdminPromptPreview, {
      loaderData: result.data,
    } as Parameters<typeof AdminPromptPreview>[0]));
    for (const content of ["<h1 lang=\"zh-CN\">草稿标题</h1>", "画{{city}}，{{city}}，{{style}}",
      'alt="草稿图片"', 'width="800"', 'height="1200"', 'type="text"', 'class="pv-select-trigger"', "风格", "复制 Prompt"])
      expect(html).toContain(content);
    expect(result.data.prompt.requiresReferenceImage).toBe(true);
    expect(html).toContain("需要参考图片");
    expect(html).toContain("https://vault-pic.disign.me/original/poster%201.png");
    expect(html).toContain('class="admin-preview-page"');
    expect(html).toContain("/admin/prompts/1/edit?ui_locale=zh-CN");
    await expect(getPromptDetail(env.DB, "preview-draft", "zh-CN", null))
      .rejects.toMatchObject({ status: 404 });
  });

  it("renders published and variable-free prompts through the same component", async () => {
    const result = await load(2, "?ui_locale=en-US");
    const html = renderToStaticMarkup(createElement(AdminPromptPreview, {
      loaderData: result.data,
    } as Parameters<typeof AdminPromptPreview>[0]));
    expect(html).toContain("已发布标题");
    expect(html).toContain("直接复制正文");
    expect(html).toContain("Copy Prompt");
    expect(html).not.toContain("variable-group");
  });

  it("returns Gone for deleted prompts before rendering their image, while public Detail stays Gone", async () => {

    try { await load(3); } catch (error) {
      expect((error as Response).headers.get("Cache-Control")).toBe("no-store");
    }
    await expect(getPromptDetail(env.DB, "preview-deleted", "zh-CN", null))
      .rejects.toMatchObject({ status: 410 });
  });

  it("switches complete translations and falls back to source for invalid or absent translations", async () => {
    const translated = (await load(1, "?ui_locale=zh-CN&prompt_locale=en-US")).data;
    expect(translated.locale).toBe("zh-CN");
    expect(translated.prompt).toMatchObject({
      title: "Draft title", description: "Draft description",
      promptTemplate: "Paint {{city}}, {{city}}, {{style}}",
      imageAlt: "Draft image", contentLanguage: "en-US",
    });
    expect(documentLanguage([{ id: "routes/admin-prompt-preview", loaderData: translated }], translated.locale))
      .toBe("en-US");
    const html = renderToStaticMarkup(createElement(AdminPromptPreview, {
      loaderData: translated,
    } as Parameters<typeof AdminPromptPreview>[0]));
    expect(html).toContain('alt="Draft image"');
    expect(html).toContain("Paint {{city}}, {{city}}, {{style}}");
    expect(html).toContain('id="variable-style"');
    expect(translated.prompt.variables[1].options).toContainEqual({ value: "retro", label: "Retro" });
    expect(html).toContain("ui_locale=zh-CN&amp;prompt_locale=en-US");
    for (const language of ["bad", "fr-FR", "zh-CN"]) {
      const result = await load(1, `?ui_locale=en-US&prompt_locale=${language}`);
      expect(result.data.prompt).toMatchObject({
        title: "草稿标题", promptTemplate: "画{{city}}，{{city}}，{{style}}",
        imageAlt: "草稿图片", contentLanguage: "zh-CN",
      });
    }
    expect((await load(2, "?prompt_locale=en-US")).data.prompt.contentLanguage).toBe("zh-CN");
    const source = (await load(2, "?ui_locale=en-US")).data;
    expect(documentLanguage([{ id: "routes/admin-prompt-preview", loaderData: source }], source.locale))
      .toBe("zh-CN");
    await env.DB.prepare("UPDATE prompts SET title = ? WHERE id = 1").bind("最新草稿标题").run();
    expect((await load(1)).data.prompt.title).toBe("最新草稿标题");
  });

  it("sets private meta and no-store for success and 4xx, nested under admin", async () => {
    const result = await load(1);
    const tags = meta({ loaderData: result.data } as Parameters<typeof meta>[0]);
    expect(tags).toContainEqual({ name: "robots", content: "noindex,nofollow" });
    expect(tags.some((tag) => "rel" in tag && tag.rel === "canonical")).toBe(false);
    expect(tags.some((tag) => "property" in tag && tag.property?.startsWith("og:"))).toBe(false);
    expect(headers({} as Parameters<typeof headers>[0])).toMatchObject({ "Cache-Control": "no-store" });
    for (const id of ["bad", "999999"]) {
      try { await load(id); throw new Error("expected 4xx"); } catch (error) {
        expect((error as Response).status).toBe(id === "bad" ? 400 : 404);
        expect((error as Response).headers.get("Cache-Control")).toBe("no-store");
      }
    }
    const admin = routes.find((route) => route.path === "admin");
    expect(admin?.children?.some((child) => child.path === "prompts/:id/preview")).toBe(true);
    expect(routes.some((route) => route.path === "prompt/:slug")).toBe(true);
    expect(routes.some((route) => route.path === "prompts/:id/preview")).toBe(false);
  });
});