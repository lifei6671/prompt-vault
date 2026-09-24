import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";
import { PromptInteraction } from "../app/components/prompt-interaction";
import { SiteHeader } from "../app/components/site-header";
import PromptDetailPage from "../app/routes/prompt-detail";
import { previewImageUrl, readExploreFilters } from "../app/lib/explore";
import { resolvePrompt, scanPromptKeys } from "../app/lib/prompt-template";
import { getPromptDetail } from "../app/services/prompt-detail.server";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) await env.DB.prepare(statement).run();
}
const detail = (slug: string, uiLocale: "zh-CN" | "en-US" = "zh-CN", language: string | null = null) =>
  getPromptDetail(env.DB, slug, uiLocale, language);

beforeAll(async () => {
  await applyMigration(migration1);
  await applyMigration(migration2);
  await applyMigration(migration4);
  await env.DB.prepare("INSERT INTO categories (id,name,slug,created_at,updated_at) VALUES (1,'海报','poster','now','now'),(2,'摄影','photo','now','now')").run();
  await env.DB.prepare("INSERT INTO category_translations (category_id,locale,name) VALUES (1,'en-US','Poster Design')").run();
  await env.DB.prepare("INSERT INTO tags (id,name,slug,created_at,updated_at) VALUES (1,'旅行','travel','now','now'),(2,'复古','vintage','now','now')").run();
  await env.DB.prepare("INSERT INTO tag_translations (tag_id,locale,name) VALUES (1,'en-US','Travel')").run();
  const insert = env.DB.prepare(`INSERT INTO prompts
    (id,slug,title,description,prompt_template,model,ratio,category_id,
     original_image_key,preview_image_key,original_content_type,original_width,
     original_height,preview_width,preview_height,original_size_bytes,
     preview_size_bytes,image_alt,status,published_at,created_at,updated_at)
     VALUES (?,?,?,?,?,'Flux','3:4',1,'original/poster 1.png','preview/poster.png',
     'image/png',800,1200,400,600,100,50,?,?,'now','now','now')`);
  await insert.bind(1,"poster","原文标题","原文描述","画{{city}}，{{city}}，{{style}}","原文图片","published").run();
  await insert.bind(2,"plain","无变量","描述","直接复制正文","无变量图","published").run();
  await insert.bind(3,"draft","草稿",null,"body","草稿图","draft").run();
  await insert.bind(4,"deleted","删除",null,"body","删除图","published").run();
  await insert.bind(5,"reference-only","参考图",null,"请处理参考图片","参考图","published").run();
  await insert.bind(6,"reference-variable","参考图变量",null,"处理{{city}}参考图片","参考图变量","published").run();
  await env.DB.prepare("UPDATE prompts SET requires_reference_image = 1 WHERE id IN (5, 6)").run();
  await env.DB.prepare("UPDATE prompts SET deleted_at='now' WHERE id=4").run();
  await env.DB.prepare(`INSERT INTO prompt_translations
    (prompt_id,locale,title,description,prompt_template,image_alt)
    VALUES (1,'en-US','English title','English description',
      'Paint {{city}}, {{city}}, {{style}}','English image')`).run();
  await env.DB.prepare("INSERT INTO prompt_tags (prompt_id,tag_id) VALUES (1,1),(1,2)").run();
  const variable = env.DB.prepare(`INSERT INTO prompt_variables
    (id,prompt_id,variable_key,label,input_type,input_placeholder,options_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'now','now')`);
  await variable.bind(1,1,"city","城市","text","输入城市",null).run();
  await variable.bind(3,6,"city","城市","text",null,null).run();
  await variable.bind(2,1,"style","风格","select","选择风格",
    JSON.stringify([{ value: "retro", labels: { "zh-CN": "复古", "en-US": "Vintage" } },
      { value: "modern", labels: { "zh-CN": "现代" } }])).run();
  await env.DB.prepare(`INSERT INTO prompt_variable_translations
    (variable_id,locale,label,input_placeholder) VALUES
    (1,'en-US','City',NULL)`).run();
});

describe("Prompt Detail D1", () => {
  it("returns published, hides draft and unknown, and marks deleted Gone", async () => {
    expect((await detail("poster")).title).toBe("原文标题");
    await expect(detail("draft")).rejects.toMatchObject({ status: 404 });
    await expect(detail("missing")).rejects.toMatchObject({ status: 404 });
    await expect(detail("deleted")).rejects.toMatchObject({ status: 410 });
  });
  it("switches complete content versions and falls back to source", async () => {
    expect(await detail("poster")).toMatchObject({
      title: "原文标题", description: "原文描述", promptTemplate: "画{{city}}，{{city}}，{{style}}",
      imageAlt: "原文图片", contentLanguage: "zh-CN", languages: ["zh-CN", "en-US"],
    });
    expect(await detail("poster", "zh-CN", "en-US")).toMatchObject({
      title: "English title", description: "English description",
      promptTemplate: "Paint {{city}}, {{city}}, {{style}}",
      imageAlt: "English image", contentLanguage: "en-US",
    });
    for (const language of ["invalid", "fr-FR", "zh-CN"]) {
      expect((await detail("poster", "en-US", language)).title).toBe("原文标题");
    }
    expect((await detail("plain", "en-US", "en-US")).contentLanguage).toBe("zh-CN");
  });
  it("localizes discovery and variable metadata with source fallback", async () => {
    const result = await detail("poster", "en-US", "en-US");
    expect(result.categoryName).toBe("Poster Design");
    expect(result.tags).toEqual([{ slug: "vintage", name: "复古" }, { slug: "travel", name: "Travel" }]);
    expect(result.variables).toEqual([
      { key: "city", type: "text", label: "City", placeholder: null, options: [] },
      { key: "style", type: "select", label: "风格", placeholder: "选择风格",
        options: [{ value: "retro", label: "Vintage" }, { value: "modern", label: "现代" }] },
    ]);
    expect((await detail("poster", "zh-CN", "en-US")).categoryName).toBe("海报");
  });
  it("keeps a null translated placeholder and falls back as a whole when the row is absent", async () => {
    const variables = (await detail("poster", "en-US", "en-US")).variables;
    expect(variables[0]).toMatchObject({ label: "City", placeholder: null });
    expect(variables[1]).toMatchObject({ label: "风格", placeholder: "选择风格" });
  });
  it("returns original image dimensions and no empty VariableGroup", async () => {
    const prompt = await detail("plain");
    expect(prompt.variables).toEqual([]);
    expect(previewImageUrl("https://vault-pic.disign.me", prompt.imageKey))
      .toBe("https://vault-pic.disign.me/original/poster%201.png");
    expect([prompt.imageWidth, prompt.imageHeight]).toEqual([800, 1200]);
    const html = renderToStaticMarkup(createElement(PromptInteraction, {
      prompt, locale: "zh-CN", pageUrl: "/prompt/plain",
    }));
    expect(html).toContain("直接复制正文");
    expect(html).toContain("复制 Prompt");
    expect(html).not.toContain("variable-group");
    const page = renderToStaticMarkup(createElement(PromptDetailPage, {
      loaderData: {
        prompt, locale: "zh-CN", pageUrl: "/prompt/plain",
        imageUrl: previewImageUrl("https://vault-pic.disign.me", prompt.imageKey),
      },
    } as Parameters<typeof PromptDetailPage>[0]));
    for (const text of ["无变量", "描述", "直接复制正文", "无变量图", "Flux", "3:4", "海报"]) {
      expect(page).toContain(text);
    }
    expect(page).toContain('width="800"');
    expect(page).toContain('height="1200"');
    expect(page).toContain('class="mobile-search"');
    expect(page.match(/role="search"/g)).toHaveLength(2);
    expect(page).toContain('href="/prompt/plain?ui_locale=en-US"');
  });
  it("SSR renders all variable and reference-image combinations before one copy action", async () => {
    for (const [slug, hasVariables, requiresImage] of [
      ["plain", false, false], ["poster", true, false],
      ["reference-only", false, true], ["reference-variable", true, true],
    ] as const) {
      const prompt = await detail(slug);
      expect(prompt.requiresReferenceImage).toBe(requiresImage);
      const html = renderToStaticMarkup(createElement(PromptDetailPage, {
        loaderData: { prompt, locale: "zh-CN", pageUrl: "/prompt/" + slug,
          imageUrl: previewImageUrl("https://vault-pic.disign.me", prompt.imageKey) },
      } as Parameters<typeof PromptDetailPage>[0]));
      expect(html.includes("自定义 Prompt 变量")).toBe(hasVariables);
      expect(html.includes("需要参考图片")).toBe(requiresImage);
      expect(html.includes("detail-requirement")).toBe(requiresImage);
      expect(html.match(/class="copy-prompt"/g)).toHaveLength(1);
      expect(html).not.toContain('type="file"');
      const requirement = html.indexOf("detail-requirement");
      const variables = html.indexOf("variable-group");
      const toolbar = html.indexOf("prompt-toolbar");
      const button = html.indexOf('class="copy-prompt"');
      const body = html.indexOf("resolved-prompt");
      if (requiresImage) expect(requirement).toBeLessThan(hasVariables ? variables : toolbar);
      if (hasVariables) expect(variables).toBeLessThan(toolbar);
      expect(toolbar).toBeLessThan(button);
      expect(button).toBeLessThan(body);
    }
    const english = await detail("reference-only", "en-US");
    const html = renderToStaticMarkup(createElement(PromptInteraction, {
      prompt: english, locale: "en-US", pageUrl: "/prompt/reference-only",
    }));
    expect(html).toContain("Reference image required");
    expect(html).not.toContain("variable-group");
  });
  it("renders one copy action above the resolved prompt with or without language tabs", async () => {
    for (const slug of ["poster", "plain"]) {
      const html = renderToStaticMarkup(createElement(PromptInteraction, {
        prompt: await detail(slug), locale: "zh-CN", pageUrl: `/prompt/${slug}`,
      }));
      const toolbar = html.indexOf('class="prompt-toolbar"');
      const button = html.indexOf('class="copy-prompt"');
      const body = html.indexOf('class="resolved-prompt"');
      expect(toolbar).toBeGreaterThan(-1);
      expect(button).toBeGreaterThan(toolbar);
      expect(button).toBeLessThan(body);
      expect(html.match(/class="copy-prompt"/g)).toHaveLength(1);
      expect(html).not.toContain("detail-copy-area");
      expect(html).toContain('role="status" aria-live="polite"');
      expect(html.includes('class="prompt-languages"')).toBe(slug === "poster");
    }
  });
});

describe("SiteHeader", () => {
  it("preserves Explore filters in both search forms", () => {
    const filters = readExploreFilters(new URLSearchParams("q=rain&category=poster&model=Flux"));
    const html = renderToStaticMarkup(createElement(SiteHeader, {
      locale: "en-US", filters, url: new URL("https://vault.disign.me/?q=rain"),
    }));
    expect(html.match(/value="rain"/g)).toHaveLength(2);
    expect(html.match(/name="category" value="poster"/g)).toHaveLength(2);
    expect(html.match(/name="model" value="Flux"/g)).toHaveLength(2);
  });
});
describe("Prompt template", () => {
  it("scans stable keys and resolves one pass while retaining blank tokens", () => {
    expect(scanPromptKeys("{{city}} {{city}} {{style}} {{Bad}}")).toEqual(["city", "style"]);
    expect(resolvePrompt("{{city}} + {{city}} / {{style}}", {}))
      .toBe("{{city}} + {{city}} / {{style}}");
    expect(resolvePrompt("{{city}} + {{city}} / {{style}}", { city: "天津" }))
      .toBe("天津 + 天津 / {{style}}");
    expect(resolvePrompt("{{city}} + {{city}} / {{style}}", {
      city: "{{style}}", style: "复古",
    })).toBe("{{style}} + {{style}} / 复古");
    expect(resolvePrompt("body", {})).toBe("body");
    expect(resolvePrompt("{{constructor}} / {{toString}}", {}))
      .toBe("{{constructor}} / {{toString}}");
    expect(resolvePrompt("{{constructor}}", { constructor: "filled" })).toBe("filled");
  });
  it("uses localized select label as the visible and copied resolved text", async () => {
    const prompt = await detail("poster", "en-US", "en-US");
    const option = prompt.variables[1].options[0];
    expect(option.value).toBe("retro");
    const resolved = resolvePrompt(prompt.promptTemplate, { city: "Tianjin", style: option.label });
    expect(resolved).toBe("Paint Tianjin, Tianjin, Vintage");
    const html = renderToStaticMarkup(createElement(PromptInteraction, {
      prompt, locale: "en-US", pageUrl: "/prompt/poster?prompt_locale=en-US",
    }));
    expect(html).toContain("Paint {{city}}, {{city}}, {{style}}");
    expect(html).toContain("Custom Prompt Variables");
    expect(html).toContain("Original");
    const inheritedNamePrompt = {
      ...prompt,
      promptTemplate: "{{constructor}}",
      variables: [{ key: "constructor", type: "text" as const, label: "Name",
        placeholder: null, options: [] }],
    };
    const inheritedNameHtml = renderToStaticMarkup(createElement(PromptInteraction, {
      prompt: inheritedNamePrompt, locale: "en-US", pageUrl: "/prompt/poster",
    }));
    expect(inheritedNameHtml).toContain("{{constructor}}");
    expect(inheritedNameHtml).not.toContain("function Object()");
  });
});



