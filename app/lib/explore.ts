import { parseLocale, type Locale } from "./localization";

export const PAGE_SIZE = 24;
export type ContentType = "all" | "image";
export type ExploreSort = "recommended" | "popular" | "latest";

export type ExploreFilters = {
  q: string;
  category: string;
  tag: string;
  model: string;
  ratio: string;
  sourceLanguage: string;
  contentType: ContentType;
  sort: ExploreSort;
};

export function readExploreFilters(params: URLSearchParams): ExploreFilters {
  return {
    q: (params.get("q") ?? "").trim(),
    category: params.get("category") ?? "",
    tag: params.get("tag") ?? "",
    model: params.get("model") ?? "",
    ratio: params.get("ratio") ?? "",
    sourceLanguage: params.get("source_language") ?? "",
    contentType: params.get("content_type") === "image" ? "image" : "all",
    sort: params.get("sort") === "recommended" || params.get("sort") === "popular"
      ? params.get("sort") as ExploreSort : "latest",
  };
}

export function exploreHref(url: URL, key: string, value: string): string {
  const next = new URL(url);
  const scope = exploreScope(url.pathname);
  if ((key === "category" || key === "tag") && (!scope || scope.kind === key)) {
    next.searchParams.delete(key);
    if (value) next.pathname = "/" + key + "/" + encodeURIComponent(value);
    else {
      const other = key === "category" ? "tag" : "category";
      const promoted = next.searchParams.get(other);
      next.searchParams.delete(other);
      next.pathname = promoted ? "/" + other + "/" + encodeURIComponent(promoted) : "/";
    }
  } else if (value) next.searchParams.set(key, value);
  else next.searchParams.delete(key);
  next.searchParams.delete("page");
  return next.pathname + next.search;
}

export function exploreScope(pathname: string): { kind: "category" | "tag"; slug: string } | null {
  const match = /^\/(category|tag)\/([^/]+)$/.exec(pathname);
  return match ? { kind: match[1] as "category" | "tag", slug: decodeURIComponent(match[2]) } : null;
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
