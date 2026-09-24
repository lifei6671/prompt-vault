import type { Locale } from "./localization";

const copy = {
  "zh-CN": {
    content: "内容", menu: "打开后台菜单", closeMenu: "关闭后台菜单",
    description: "管理 Prompt、译文、变量、图片与发布状态。",
    total: "总计", all: "全部", search: "搜索标题或 Slug", searchLabel: "搜索 Prompt",
    apply: "筛选", reset: "重置筛选", actions: "操作", view: "查看（只读）",
    noResults: "没有符合条件的 Prompt。", showing: "显示 {from}–{to} / {total} 条",
    previous: "上一页", next: "下一页", page: "第 {page} / {pages} 页",
    image: "预览图", list: "Prompt 列表",
  },
  "en-US": {
    content: "Content", menu: "Open admin menu", closeMenu: "Close admin menu",
    description: "Manage prompts, translations, variables, images, and publishing.",
    total: "Total", all: "All", search: "Search title or slug", searchLabel: "Search prompts",
    apply: "Filter", reset: "Reset filters", actions: "Actions", view: "View (read only)",
    noResults: "No prompts match these filters.", showing: "Showing {from}–{to} of {total}",
    previous: "Previous", next: "Next", page: "Page {page} of {pages}",
    image: "Preview image", list: "Prompt list",
  },
} as const;

export function adminListCopy(locale: Locale) { return copy[locale]; }
