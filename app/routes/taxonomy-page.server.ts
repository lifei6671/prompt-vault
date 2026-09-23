import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { pageHref, readPage, readUiLocale } from "../lib/explore";
import { listTaxonomyPrompts, type TaxonomyKind } from "../services/prompt.server";

export async function loadTaxonomy(request: Request, slug: string, kind: TaxonomyKind) {
  const url = new URL(request.url);
  const page = readPage(url.searchParams);
  if (url.searchParams.has("page") && page === 1) throw redirect(pageHref(url, 1));
  const locale = readUiLocale(request);
  const result = await listTaxonomyPrompts(env.DB, kind, slug, locale, page);
  return { ...result, kind, locale, page, pageUrl: url.pathname + url.search,
    imageBaseUrl: env.IMAGE_BASE_URL };
}
