import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { exploreContentType, explorePath, readExploreFilters, readPage, readUiLocale } from "~/lib/explore";
import { isDiscoveryQuery } from "~/lib/seo";
import { listExplorePrompts, getTaxonomyIdentity, type TaxonomyKind } from "~/services/prompt.server";

export async function loadExplore(request: Request, scope?: { kind: TaxonomyKind; slug: string }) {
  const url = new URL(request.url);
  const original = url.pathname + url.search;
  const contentType = exploreContentType(url.pathname) === "image"
    || (url.searchParams.get("content_type") === "image" && !url.pathname.startsWith("/image"))
    ? "image" : "all";
  const page = readPage(url.searchParams);
  const locale = readUiLocale(request);
  let taxonomy: { kind: TaxonomyKind; slug: string; name: string; description: string | null; contentLanguage: typeof locale } | null = null;

  if (!scope) {
    const kind = url.searchParams.get("category") ? "category"
      : url.searchParams.get("tag") ? "tag" : null;
    if (kind) {
      const identity = await getTaxonomyIdentity(env.DB, kind, url.searchParams.get(kind)!, locale);
      url.pathname = explorePath(contentType, { kind, slug: identity.slug });
      url.searchParams.delete(kind);
      scope = { kind, slug: identity.slug };
      taxonomy = { kind, ...identity };
    }
  }
  if (scope) {
    const identity = taxonomy ?? { kind: scope.kind,
      ...await getTaxonomyIdentity(env.DB, scope.kind, scope.slug, locale) };
    taxonomy = identity;
    url.pathname = explorePath(contentType, { kind: scope.kind, slug: identity.slug });
    url.searchParams.delete(scope.kind);
    const other = scope.kind === "category" ? "tag" : "category";
    const otherSlug = url.searchParams.get(other);
    if (otherSlug) {
      const secondary = await getTaxonomyIdentity(env.DB, other, otherSlug, locale);
      url.searchParams.set(other, secondary.slug);
    }
  }
  for (const key of ["q", "model", "ratio", "source_language", "category", "tag"]) {
    if (url.searchParams.get(key) === "") url.searchParams.delete(key);
  }
  if (!scope) url.pathname = explorePath(contentType);
  url.searchParams.delete("content_type");
  if (url.searchParams.has("sort") && readExploreFilters(url.searchParams).sort === "latest") url.searchParams.delete("sort");
  if (page === 1) url.searchParams.delete("page");
  if (url.pathname + url.search !== original) throw redirect(url.pathname + url.search);

  const filters = readExploreFilters(url.searchParams, contentType);
  if (taxonomy) filters[taxonomy.kind] = taxonomy.slug;
  const result = await listExplorePrompts(env.DB, filters, locale, page);
  return { ...result, page, locale, filters, taxonomy,
    filtered: isDiscoveryQuery(url.searchParams),
    pageUrl: url.pathname + url.search, imageBaseUrl: env.IMAGE_BASE_URL };
}
