export const PUBLIC_HTML_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=60";
export const PUBLIC_CRAWLER_CACHE = "public, max-age=300, s-maxage=300";
export const NO_STORE = "no-store";

export function isAdminPath(pathname: string): boolean {
  let path = pathname;
  try { path = decodeURIComponent(path); } catch { /* Preserve malformed paths. */ }
  path = path.toLowerCase();
  return path === "/admin" || path.startsWith("/admin/");
}

export function responseCachePolicy(request: Request, response: Response): string | null {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (isAdminPath(pathname)) return NO_STORE;

  if ((request.method !== "GET" && request.method !== "HEAD")
    || response.status !== 200 || response.headers.has("Set-Cookie")) return NO_STORE;

  const crawler = pathname === "/robots.txt" || pathname === "/sitemap.xml";
  const document = response.headers.get("Content-Type")?.toLowerCase().includes("text/html") ?? false;
  if (!crawler && !document) return null;

  if (request.headers.has("Cookie") || url.searchParams.has("ui_locale")
    || url.searchParams.has("prompt_locale")) return NO_STORE;

  if (crawler) return url.search ? NO_STORE : PUBLIC_CRAWLER_CACHE;

  const listPage = pathname === "/" || /^\/(category|tag)\/[^/]+\/?$/.test(pathname);
  const detailPage = /^\/prompt\/[^/]+\/?$/.test(pathname);
  if (!listPage && !detailPage) return NO_STORE;
  if ([...url.searchParams.keys()].some((key) => key !== "page" || !listPage)) return NO_STORE;
  return PUBLIC_HTML_CACHE;
}

export function applyResponseCachePolicy(request: Request, response: Response): Response {
  const policy = responseCachePolicy(request, response);
  if (!policy) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", policy);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
