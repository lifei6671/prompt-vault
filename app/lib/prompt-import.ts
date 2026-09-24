import type { Locale, SelectOption } from "./localization";
import type { Variable } from "../services/prompt-admin.server";

export type PromptImport = {
  slug: string; title: string; category: string; tags: string[]; model: string;
  ratio: string; createdAt: string | null; sourceLanguage: Locale; imageAlt: string;
  promptTemplate: string; variables: Variable[]; errors: string[]; warnings: string[];
};

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value.normalize("NFC")) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function asciiSlug(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
}

export function stableSlug(value: string, prefix: "prompt" | "category" | "tag"): string {
  return asciiSlug(value) || prefix + "-" + stableHash(value);
}

export function detectRatio(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("Invalid dimensions");
  const common = [[1, 1], [16, 9], [9, 16], [4, 3], [3, 4], [3, 2], [2, 3], [21, 9], [9, 21]];
  const match = common.find(([w, h]) => Math.abs(width / height - w / h) <= 0.02);
  if (match) return match[0] + ":" + match[1];
  let a = width, b = height;
  while (b) [a, b] = [b, a % b];
  return width / a + ":" + height / a;
}

const semanticKeys: Record<string, string> = {
  "主题": "topic", "主题词": "topic", "主题或主标题": "topic", "主题 / 主标题": "topic", "主标题": "title",
  "副标题": "subtitle", "核心观点": "core_viewpoint", "画幅比例": "aspect_ratio",
  "语言": "language", "用途": "usage", "情绪": "mood", "情绪倾向": "mood",
  "可选情绪倾向": "mood", "禁用元素": "excluded_elements",
  "可选禁用元素": "excluded_elements", "避免元素": "excluded_elements",
};
const asciiKey = /^[a-z][a-z0-9_]{0,63}$/;
const blankChoice = /^(?:可留空|留空|可选|默认(?:值)?(?:为)?.*)$/;
const trailingNote = /[,，]\s*(?:可留空|必填|optional|默认(?:值)?(?:为)?.*|default\b.*)$/i;

function cleanLookup(value: string): string {
  return value.trim().replace(trailingNote, "").trim();
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed) as string; } catch { return trimmed.slice(1, -1); }
  }
  return trimmed.replace(/^'|'$/g, "");
}

function frontmatter(document: string): { fields: Record<string, string>; tags: string[]; body: string; found: boolean } {
  const normalized = document.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) {
    const fields: Record<string, string> = {};
    const tags: string[] = [];
    const body: string[] = [];
    let beforePrompt = true, list = "";
    for (const line of normalized.split("\n")) {
      if (/^#{2,6}\s+Prompt\s*$/i.test(line.trim())) beforePrompt = false;
      const item = line.match(/^\s*-\s+(.+?)\s*$/);
      if (beforePrompt && list === "tags" && item) { tags.push(unquote(item[1])); continue; }
      const scalar = line.match(/^([a-z_]+)\s*:\s*(.*?)\s*$/i);
      if (beforePrompt && scalar && /^(?:id|title|category|tags|model|ratio|aspect_ratio|created_at)$/.test(scalar[1].toLowerCase())) {
        list = scalar[1].toLowerCase();
        fields[list] = unquote(scalar[2]);
        if (list === "tags" && fields.tags) tags.push(...fields.tags.split(",").map(unquote).filter(Boolean));
        continue;
      }
      list = "";
      body.push(line);
    }
    return { fields, tags: [...new Set(tags)], body: body.join("\n"), found: false };
  }
  const fields: Record<string, string> = {};
  const tags: string[] = [];
  let list = "";
  for (const line of match[1].split("\n")) {
    const item = line.match(/^\s*-\s+(.+?)\s*$/);
    if (list === "tags" && item) { tags.push(unquote(item[1])); continue; }
    const scalar = line.match(/^([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if (scalar) {
      list = scalar[1].toLowerCase();
      fields[list] = unquote(scalar[2]);
      if (list === "tags" && fields.tags.startsWith("[")) {
        tags.push(...fields.tags.slice(1, -1).split(",").map(unquote).filter(Boolean));
      }
    }
  }
  return { fields, tags: [...new Set(tags.filter(Boolean))], body: normalized.slice(match[0].length), found: true };
}

function extractBody(body: string): string {
  const lines = body.split("\n");
  const heading = lines.findIndex((line) => /^#{2,6}\s+Prompt\s*$/i.test(line.trim()));
  if (heading >= 0) {
    const after = lines.slice(heading + 1).join("\n").trim();
    const fence = after.match(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*(?:\n|$)/);
    return (fence ? fence[2] : after).trim();
  }
  return body.replace(/^#\s+.+(?:\n|$)/m, "")
    .replace(/^\s*!\[[^\]]*\]\([^\n)]*\)\s*$/gm, "").trim();
}

function lineLabel(line: string, tokenStart: number): string {
  const before = line.slice(0, tokenStart);
  const match = before.match(/(?:^|[;；])\s*(?:[-*]\s*)?([^:：\n]{1,120})\s*[:：]\s*$/);
  return match?.[1].trim() ?? "";
}

function selectOptions(raw: string, locale: Locale): SelectOption[] | null {
  if (!raw.includes("/")) return null;
  const choices = [...new Set(raw.split(/\s*[/／]\s*/).map(cleanLookup).filter((item) => item && !blankChoice.test(item)))];
  if (choices.length < 2 || choices.length > 20) return null;
  const values = new Set<string>();
  return choices.map((label) => {
    let value = asciiSlug(label).replace(/-/g, "_") || "option_" + stableHash(label);
    if (!/^[a-z]/.test(value)) value = "option_" + stableHash(label);
    value = value.slice(0, 64);
    if (values.has(value)) value = "option_" + stableHash(label);
    values.add(value);
    return { value, labels: { [locale]: label } };
  });
}

export function normalizeLegacyVariables(template: string, locale: Locale): { template: string; variables: Variable[] } {
  const variables = new Map<string, Variable>();
  const identities = new Map<string, string>();
  const lines = template.split("\n");
  const rewritten = lines.map((line) => line.replace(/\{\{([^{}\n]+)\}\}/g, (_token, inner: string, offset: number) => {
    const raw = inner.trim();
    const label = lineLabel(line, offset) || raw;
    const generic = /^(?:可留空|留空|可选)$/.test(raw);
    const identity = generic ? raw + "\u0000" + label : raw;
    let key = identities.get(identity);
    if (!key) {
      key = asciiKey.test(raw) ? raw : semanticKeys[cleanLookup(raw)] ??
        semanticKeys[cleanLookup(label)] ?? "field_" + stableHash(identity);
      if (variables.has(key) && key.startsWith("field_") && identities.get(identity) !== key)
        key = "field_" + stableHash(identity + raw);
      identities.set(identity, key);
      const options = selectOptions(raw, locale);
      if (!variables.has(key)) variables.set(key, { key, type: options ? "select" : "text", label: label.slice(0, 120),
        placeholder: options ? null : raw.slice(0, 300), translation_label: null,
        translation_placeholder: null, options });
    }
    return "{{" + key + "}}";
  }));
  return { template: rewritten.join("\n"), variables: [...variables.values()] };
}

export function parsePromptImport(document: string, imageRatio = ""): PromptImport {
  const { fields, tags, body, found } = frontmatter(document);
  const title = fields.title || body.match(/^#\s+(.+)$/m)?.[1].trim() || "";
  const rawTemplate = extractBody(body);
  const sourceLanguage: Locale = /[\u3400-\u9fff]/u.test(title + "\n" + rawTemplate) ? "zh-CN" : "en-US";
  const normalized = normalizeLegacyVariables(rawTemplate, sourceLanguage);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!title) errors.push("title");
  if (!normalized.template) errors.push("prompt");
  if (!fields.category) errors.push("category");
  if (normalized.variables.length > 100 || JSON.stringify(normalized.variables).length > 100_000 ||
    [...normalized.template.matchAll(/\{\{[^{}]*\}\}/g)].some(([token]) => !/^\{\{[a-z][a-z0-9_]{0,63}\}\}$/.test(token)))
    errors.push("variables");
  if (document.length > 100_000 || title.length > 200 || (fields.category?.length ?? 0) > 120 ||
    tags.some((tag) => tag.length > 120) || (fields.model?.length ?? 0) > 120 ||
    (fields.ratio || fields.aspect_ratio || imageRatio).length > 60) errors.push("metadata");
  if (normalized.template.length > 50_000) errors.push("prompt");
  if (!found) warnings.push("frontmatter");
  const createdAt = fields.created_at && !Number.isNaN(Date.parse(fields.created_at)) ? fields.created_at : null;
  if (fields.created_at && !createdAt) warnings.push("created_at");
  const slug = stableSlug(fields.id || title, "prompt");
  return { slug, title, category: fields.category || "", tags, model: fields.model || "",
    ratio: fields.ratio || fields.aspect_ratio || imageRatio, createdAt, sourceLanguage,
    imageAlt: title, promptTemplate: normalized.template, variables: normalized.variables, errors, warnings };
}
