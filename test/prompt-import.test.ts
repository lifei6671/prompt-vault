import { describe, expect, it } from "vitest";
import { detectRatio, normalizeLegacyVariables, parsePromptImport, stableSlug } from "../app/lib/prompt-import";
import { parseVariables, validateTokens } from "../app/services/prompt-admin.server";

const whiteboard = [
  "---", "title: \"白板解释图\"", "category: 信息图", "tags:", "- 白板", "  - 教育",
  "model: GPT Image", "aspect_ratio: 16:9", "created_at: 2024-01-01", "---",
  "# 白板解释图", "![预览](preview.png)", "## Prompt",
  "核心问题：{{这张图最终要解释清楚的问题}}",
  "主题：{{主题}}；再说一次 {{主题}}",
  "副标题：{{可留空}}", "说明：{{可留空}}",
  "语言：{{中文 / 英文 / 中英混排 / 可留空}}",
].join("\n");
const standard = [
  "---", "id: sunset-poster", "title: Sunset Poster", "category: Posters",
  "tags:", "  - travel", "  - vintage", "model: Flux", "ratio: 3:2", "---",
  "# Sunset Poster", "![Preview](./preview.webp)", "## Prompt", "```text",
  "A warm sunset over {{city}}.", "```", "## Notes", "Ignore this.",
].join("\n");

describe("Prompt import parser", () => {
  it("parses whiteboard Frontmatter and an unfenced Prompt without metadata leakage", () => {
    const result = parsePromptImport(whiteboard);
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ title: "白板解释图", category: "信息图", tags: ["白板", "教育"],
      model: "GPT Image", ratio: "16:9", sourceLanguage: "zh-CN", imageAlt: "白板解释图",
      createdAt: "2024-01-01" });
    expect(result.slug).toMatch(/^prompt-[a-f0-9]{8}$/);
    expect(result.promptTemplate).toContain("核心问题：{{field_");
    expect(result.promptTemplate).not.toMatch(/^(---|# 白板|!\[)/m);
    expect(result.variables.find((item) => item.label === "核心问题")).toBeDefined();
    expect(result.variables.find((item) => item.type === "select")?.options?.map((item) => item.labels["zh-CN"]))
      .toEqual(["中文", "英文", "中英混排"]);
    expect(() => validateTokens(result.promptTemplate, null,
      parseVariables(JSON.stringify(result.variables), result.sourceLanguage))).not.toThrow();
  });

  it("extracts fenced Prompt body from standard index.md and preserves ASCII keys", () => {
    const result = parsePromptImport(standard);
    expect(result).toMatchObject({ slug: "sunset-poster", sourceLanguage: "en-US", ratio: "3:2",
      promptTemplate: "A warm sunset over {{city}}." });
    expect(result.variables).toMatchObject([{ key: "city", type: "text" }]);
    expect(result.promptTemplate).not.toContain("Notes");
  });

  it("uses H1, stable slug and cleaned body when Frontmatter is absent", () => {
    const document = "# 中文标题\n![预览](a.png)\n写一个关于 {{主题}} 的提示词。";
    const first = parsePromptImport(document), second = parsePromptImport(document);
    expect(first.slug).toBe(second.slug);
    expect(first.slug).toMatch(/^prompt-[a-f0-9]{8}$/);
    expect(first.title).toBe("中文标题");
    expect(first.promptTemplate).toBe("写一个关于 {{topic}} 的提示词。");
    expect(first.warnings).toContain("frontmatter");
    expect(stableSlug("A Simple Title", "prompt")).toBe("a-simple-title");
    expect(parsePromptImport("# English Title\nBody").sourceLanguage).toBe("en-US");
    const inline = parsePromptImport("title: Inline\ncategory: Posters\ntags:\n- travel\n# Inline\n## Prompt\nBody");
    expect(inline).toMatchObject({ title: "Inline", category: "Posters", tags: ["travel"], promptTemplate: "Body" });
  });

  it("prioritizes ratio, accepts aspect_ratio and falls back to detected image ratio", () => {
    expect(parsePromptImport(standard, "1:1").ratio).toBe("3:2");
    expect(parsePromptImport(whiteboard, "1:1").ratio).toBe("16:9");
    expect(parsePromptImport("---\ntitle: A\ncategory: C\n---\n## Prompt\nBody", "4:3").ratio).toBe("4:3");
    expect(detectRatio(1920, 1080)).toBe("16:9");
    expect(detectRatio(1000, 997)).toBe("1:1");
    expect(detectRatio(1000, 777)).toBe("1000:777");
  });

  it("keeps repeated semantic keys, separates generic blanks and creates valid select options", () => {
    const normalized = normalizeLegacyVariables(
      "主题：{{主题}}\n再次：{{主题}}\n副标题：{{可留空}}\n说明：{{可留空}}\n{{city}}\n{{主题词}}",
      "zh-CN");
    expect(normalized.template.match(/\{\{topic\}\}/g)).toHaveLength(3);
    expect(normalized.variables.find((item) => item.key === "city")).toBeDefined();
    const blanks = normalized.variables.filter((item) => item.placeholder === "可留空");
    expect(blanks).toHaveLength(2);
    expect(blanks[0].key).not.toBe(blanks[1].key);
    expect(() => validateTokens(normalized.template, null,
      parseVariables(JSON.stringify(normalized.variables), "zh-CN"))).not.toThrow();
    expect(normalizeLegacyVariables("No variables", "en-US").variables).toEqual([]);
  });

  it("normalizes real illustration fields to semantic keys and valid select options", () => {
    const template = [
      "主题 / 主标题：{{主题}}",
      "核心问题：{{这张图最终要解释清楚的问题}}",
      "核心观点：{{一句话说明最重要的判断}}",
      "中心流程 / 核心关系：{{例如：输入 → 分析 → 决策 → 执行 → 反馈 → 优化，可留空}}",
      "关键模块：{{4–8 个知识模块，可留空，由模型根据主题自动拆解}}",
      "对比关系：{{需要比较的两个或多个对象，可留空}}",
      "数据 / 实验信号：{{需要展示的数据、比例、指标或案例，可留空}}",
      "最终启发：{{希望读者看完后记住的一句话，可留空}}",
      "画幅比例：{{默认 16:9}}",
      "语言：{{中文 / 英文 / 中英混排，默认中文}}",
      "用途：{{技术文章插图 / 知识科普 / 研究报告 / 公众号配图 / 培训材料}}",
    ].join("\n");
    const normalized = normalizeLegacyVariables(template, "zh-CN");
    expect(normalized.template).toContain("主题 / 主标题：{{topic}}");
    expect(normalized.template).toContain("核心观点：{{core_viewpoint}}");
    expect(normalized.template).toContain("画幅比例：{{aspect_ratio}}");
    expect(normalized.template).toContain("语言：{{language}}");
    expect(normalized.template).toContain("用途：{{usage}}");
    const byKey = new Map(normalized.variables.map((item) => [item.key, item]));
    expect(normalized.variables).toHaveLength(11);
    expect(byKey.get("language")).toMatchObject({ type: "select", label: "语言" });
    expect(byKey.get("language")?.options?.map((item) => item.labels["zh-CN"]))
      .toEqual(["中文", "英文", "中英混排"]);
    expect(byKey.get("usage")).toMatchObject({ type: "select", label: "用途" });
    expect(byKey.get("usage")?.options?.map((item) => item.labels["zh-CN"]))
      .toEqual(["技术文章插图", "知识科普", "研究报告", "公众号配图", "培训材料"]);
    for (const key of ["language", "usage"] as const) {
      const values = byKey.get(key)?.options?.map((item) => item.value) ?? [];
      expect(values.every((value) => /^[a-z][a-z0-9_]{0,63}$/.test(value))).toBe(true);
      expect(new Set(values).size).toBe(values.length);
    }
    expect(() => validateTokens(normalized.template, null,
      parseVariables(JSON.stringify(normalized.variables), "zh-CN"))).not.toThrow();
  });

  it("keeps key priority and strips only explicit trailing lookup notes", () => {
    const normalized = normalizeLegacyVariables([
      "主题：{{custom_key}}",
      "语言：{{副标题，可留空}}",
      "副标题，可留空：{{请填写内容}}",
      "备注：{{普通内容，保留说明}}",
      "语言：{{中文 / 英文 / 中英混排，默认中英混排}}",
      "语言：{{中文 / 英文, optional}}",
    ].join("\n"), "zh-CN");
    expect(normalized.template).toContain("主题：{{custom_key}}");
    expect(normalized.template).toContain("语言：{{subtitle}}");
    expect(normalized.template).toContain("副标题，可留空：{{subtitle}}");
    expect(normalized.template).toContain("备注：{{field_");
    expect(normalized.variables.find((item) => item.key === "language")?.options?.map((item) => item.labels["zh-CN"]))
      .toEqual(["中文", "英文", "中英混排"]);
    expect(normalized.variables.find((item) => item.label === "备注")?.placeholder).toBe("普通内容，保留说明");
    expect(normalizeLegacyVariables("副标题，可留空：{{请填写内容}}", "zh-CN").variables[0])
      .toMatchObject({ key: "subtitle", label: "副标题，可留空", placeholder: "请填写内容" });
    const deduplicated = normalizeLegacyVariables("语言：{{中文 / 英文 / 英文，默认英文}}", "zh-CN");
    expect(deduplicated.variables[0].options?.map((item) => item.labels["zh-CN"]))
      .toEqual(["中文", "英文"]);
    for (const note of ["可留空", "optional", "默认英文", "default English"]) {
      const result = normalizeLegacyVariables(`语言：{{中文 / 英文, ${note}}}`, "zh-CN");
      expect(result.variables[0].options?.map((item) => item.labels["zh-CN"]))
        .toEqual(["中文", "英文"]);
    }
  });
});
