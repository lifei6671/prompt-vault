export const SITE_URL = "https://vault.disign.me";

export function canonicalUrl(pathname: string, page = 1): string {
  const url = new URL(pathname, SITE_URL);
  url.search = "";
  if (page >= 2) url.searchParams.set("page", String(page));
  return url.toString();
}

export function isDiscoveryQuery(params: URLSearchParams): boolean {
  return [...params.keys()].some((key) =>
    key !== "page" && key !== "ui_locale" && key !== "prompt_locale");
}
