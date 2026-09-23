import { parseLocale, type Locale } from "./localization";

export const PAGE_SIZE = 24;

export type ExploreFilters = {
  q: string;
  category: string;
  tag: string;
  model: string;
  ratio: string;
  sourceLanguage: string;
};

export function readExploreFilters(params: URLSearchParams): ExploreFilters {
  return {
    q: (params.get("q") ?? "").trim(),
    category: params.get("category") ?? "",
    tag: params.get("tag") ?? "",
    model: params.get("model") ?? "",
    ratio: params.get("ratio") ?? "",
    sourceLanguage: params.get("source_language") ?? "",
  };
}

export function readPage(params: URLSearchParams): number {
  const value = params.get("page");
  if (value === null) return 1;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Response("Not Found", { status: 404 });
  }
  return Number(value);
}

export function pageHref(url: URL, page: number): string {
  const next = new URL(url);
  if (page === 1) next.searchParams.delete("page");
  else next.searchParams.set("page", String(page));
  return `${next.pathname}${next.search}`;
}

export function readUiLocale(request: Request): Locale {
  const explicit = new URL(request.url).searchParams.get("ui_locale");
  const cookie = request.headers.get("Cookie")?.split(";").map((item) => item.trim())
    .find((item) => item.startsWith("ui_locale="))?.slice("ui_locale=".length);
  const value = explicit ?? cookie;
  try {
    return parseLocale(value);
  } catch {
    return "zh-CN";
  }
}

export function uiLocaleCookie(request: Request, locale: Locale): string | null {
  if (!new URL(request.url).searchParams.has("ui_locale")) return null;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `ui_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function localeHref(url: URL, locale: Locale): string {
  const next = new URL(url);
  next.searchParams.set("ui_locale", locale);
  return `${next.pathname}${next.search}`;
}

export function previewImageUrl(baseUrl: string, key: string): string {
  const path = key.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return new URL(path, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}
