import type { Locale } from "./localization";

const copy = {
  "zh-CN": {
    prompts: "Prompt 管理", empty: "暂无 Prompt", edit: "编辑", back: "返回列表",
    slug: "Slug", title: "标题", status: "状态", category: "分类", model: "模型",
    ratio: "画幅", publishedAt: "首次发布时间", updatedAt: "更新时间",
    draft: "草稿", published: "已发布", deleted: "已删除",
    original: "原文", translation: "译文", description: "描述", template: "Prompt 正文",
    imageAlt: "图片说明", imageMetadata: "图片元数据（只读）",
    variables: "变量 JSON", example: "JSON 示例", variablesHelp: "使用数组。text 的 options 必须为 null；select 的 options 为 [{\"value\":\"stable_key\",\"labels\":{\"zh-CN\":\"中文\",\"en-US\":\"English\"}}]。key 必须与原文和译文的 {{key}} 一致。",
    translationMode: "译文状态", present: "保存完整译文", remove: "清空译文",
    tags: "标签", save: "保存修改", publish: "发布", withdraw: "撤回", softDelete: "软删除",
    saveFirst: "发布只检查已保存的版本；修改表单后请先保存。",
    slugFrozen: "首次发布后 Slug 永久冻结。",
    invalid: "输入无效，请检查必填字段、变量 JSON、选项及译文。",
    missing: "Prompt 不存在。", conflict: "Slug 或分类/标签引用冲突，或当前状态不允许此操作。",
    deletedError: "已删除的 Prompt 不允许再修改。", tokens: "原文、译文中的 token 必须与变量 key 集合完全一致。",
    failed: "保存失败，请稍后重试。",
  },
  "en-US": {
    prompts: "Prompt management", empty: "No prompts yet", edit: "Edit", back: "Back to list",
    slug: "Slug", title: "Title", status: "Status", category: "Category", model: "Model",
    ratio: "Ratio", publishedAt: "First published", updatedAt: "Updated",
    draft: "Draft", published: "Published", deleted: "Deleted",
    original: "Source", translation: "Translation", description: "Description", template: "Prompt body",
    imageAlt: "Image alt", imageMetadata: "Image metadata (read only)",
    variables: "Variables JSON", example: "JSON example", variablesHelp: "Use an array. text requires options: null; select requires options: [{\"value\":\"stable_key\",\"labels\":{\"zh-CN\":\"中文\",\"en-US\":\"English\"}}]. Keys must match {{key}} in source and translation.",
    translationMode: "Translation", present: "Save complete translation", remove: "Clear translation",
    tags: "Tags", save: "Save changes", publish: "Publish", withdraw: "Withdraw", softDelete: "Soft delete",
    saveFirst: "Publish checks the saved version. Save form changes first.",
    slugFrozen: "Slug is permanently frozen after first publication.",
    invalid: "Invalid input. Check required fields, variables JSON, options and translation.",
    missing: "Prompt not found.", conflict: "Slug or taxonomy reference conflict, or action is unavailable in this state.",
    deletedError: "Deleted prompts cannot be changed.", tokens: "Source and translation tokens must match variable keys exactly.",
    failed: "Save failed. Please try again.",
  },
} as const;
export function adminPromptCopy(locale: Locale) { return copy[locale]; }
