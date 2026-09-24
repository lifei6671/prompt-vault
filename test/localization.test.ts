import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";
import {
  parseLocale,
  parseSelectOptions,
  resolveLocalized,
  resolveOptionLabel,
} from "../app/lib/localization";

async function applyMigration(sql: string) {
  for (const statement of sql.split(";").map((part) =>
    part.replace(/^--.*$/gm, "").trim(),
  ).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

describe("bilingual content contract", () => {
  it("accepts only first-release locales", () => {
    expect(parseLocale("zh-CN")).toBe("zh-CN");
    expect(parseLocale("en-US")).toBe("en-US");
    expect(() => parseLocale("fr-FR")).toThrow("Unsupported locale");
    expect(() => parseLocale(null)).toThrow("Unsupported locale");
  });

  it("uses a target translation, otherwise the permanent source", () => {
    const source = { title: "原题", prompt_template: "原文" };
    const english = { title: "Original title", prompt_template: "Source text" };
    expect(resolveLocalized(source, "zh-CN", "en-US", null)).toEqual({
      content: source,
      locale: "zh-CN",
    });
    expect(resolveLocalized(source, "zh-CN", "en-US", {
      locale: "en-US",
      content: english,
    })).toEqual({ content: english, locale: "en-US" });
    expect(resolveLocalized(source, "zh-CN", "zh-CN", {
      locale: "en-US",
      content: english,
    })).toEqual({ content: source, locale: "zh-CN" });
  });

  it("keeps select values stable while labels follow content language", () => {
    const options = parseSelectOptions(JSON.stringify([
      { value: "vintage", labels: { "zh-CN": "复古", "en-US": "Vintage" } },
      { value: "modern", labels: { "zh-CN": "现代" } },
    ]), "zh-CN");
    expect(options.map((option) => option.value)).toEqual(["vintage", "modern"]);
    expect(resolveOptionLabel(options[0], "zh-CN", "en-US")).toBe("Vintage");
    expect(resolveOptionLabel(options[1], "zh-CN", "en-US")).toBe("现代");
    expect(parseSelectOptions(JSON.stringify([{ value: "classic", labels: { "en-US": "Classic" } }]), "en-US")).toHaveLength(1);
  });

  it("rejects malformed or unstable select options", () => {
    const parse = (value: unknown) => parseSelectOptions(JSON.stringify(value), "zh-CN");
    expect(() => parse([])).toThrow();
    expect(() => parse(["复古"])).toThrow();
    expect(() => parse([{ value: "复古", labels: { "zh-CN": "复古" } }])).toThrow();
    expect(() => parse([{ value: "vintage", labels: { "en-US": "Vintage" } }])).toThrow();
    expect(() => parse([{ value: "vintage", labels: { "zh-CN": "复古", "fr-FR": "Ancien" } }])).toThrow();
    expect(() => parse([
      { value: "vintage", labels: { "zh-CN": "复古" } },
      { value: "vintage", labels: { "zh-CN": "旧式" } },
    ])).toThrow();
    expect(() => parseSelectOptions("{", "zh-CN")).toThrow();
  });
});

describe("0001 + 0002 + 0004 migration", () => {
  it("preserves legacy source data and enables locale-keyed translations", async () => {
    await applyMigration(migration1);
    await env.DB.prepare(
      "INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES (1, '风格', 'style', 'now', 'now')",
    ).run();
    await env.DB.prepare(
      `INSERT INTO prompts
       (id, slug, title, prompt_template, category_id, original_image_key, preview_image_key,
        original_content_type, original_width, original_height, preview_width, preview_height,
        original_size_bytes, preview_size_bytes, image_alt, status, created_at, updated_at)
       VALUES (1, 'poster', '海报', '生成 {{style}} 海报', 1, 'original', 'preview',
               'image/png', 100, 100, 100, 100, 100, 100, '海报预览', 'draft', 'now', 'now')`,
    ).run();
    await env.DB.prepare(
      "INSERT INTO prompt_variables (id, prompt_id, variable_key, label, input_type, options_json, created_at, updated_at) VALUES (1, 1, 'style', '风格', 'select', ?, 'now', 'now')",
    ).bind(JSON.stringify(["复古", "现代"])).run();

    await applyMigration(migration2);
    await applyMigration(migration4);

    const prompt = await env.DB.prepare(
      "SELECT source_language, title, prompt_template, requires_reference_image FROM prompts WHERE id = 1",
    ).first<{ source_language: string; title: string; prompt_template: string; requires_reference_image: number }>();
    expect(prompt).toEqual({ source_language: "zh-CN", title: "海报", prompt_template: "生成 {{style}} 海报",
      requires_reference_image: 0 });
    const variable = await env.DB.prepare(
      "SELECT options_json FROM prompt_variables WHERE id = 1",
    ).first<{ options_json: string }>();
    expect(parseSelectOptions(variable!.options_json, "zh-CN")).toEqual([
      { value: "option_1", labels: { "zh-CN": "复古" } },
      { value: "option_2", labels: { "zh-CN": "现代" } },
    ]);

    await env.DB.prepare(
      "INSERT INTO prompt_translations (prompt_id, locale, title, prompt_template, image_alt) VALUES (1, 'en-US', 'Poster', 'Create {{style}} poster', 'Poster preview')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO category_translations (category_id, locale, name) VALUES (1, 'en-US', 'Style')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO prompt_variable_translations (variable_id, locale, label) VALUES (1, 'en-US', 'Style')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO tags (id, name, slug, created_at, updated_at) VALUES (1, '海报', 'poster-tag', 'now', 'now')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO tag_translations (tag_id, locale, name) VALUES (1, 'en-US', 'Poster')",
    ).run();
    const translation = await env.DB.prepare(
      "SELECT title FROM prompt_translations WHERE prompt_id = 1 AND locale = 'en-US'",
    ).first<{ title: string }>();
    expect(translation?.title).toBe("Poster");

    await expect(env.DB.prepare(
      "INSERT INTO prompt_translations (prompt_id, locale, title, prompt_template, image_alt) VALUES (1, 'fr-FR', 'X', 'X', 'X')",
    ).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO prompt_translations (prompt_id, locale, title, prompt_template, image_alt) VALUES (1, 'en-US', 'X', 'X', 'X')",
    ).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "UPDATE prompts SET source_language = 'fr-FR' WHERE id = 1",
    ).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO tag_translations (tag_id, locale, name) VALUES (999, 'en-US', 'Orphan')",
    ).run()).rejects.toThrow();
  });
});
