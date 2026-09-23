import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { SiteHeader } from "~/components/site-header";
import { ExploreFiltersBar } from "~/components/explore-filters";
import { PromptGrid } from "~/components/prompt-grid";
import { Pagination } from "~/components/pagination";
import { uiCopy } from "~/lib/ui-copy";
import { pageHref, readExploreFilters, readPage, readUiLocale } from "~/lib/explore";
import { listExplorePrompts } from "~/services/prompt.server";
import { canonicalUrl, isDiscoveryQuery } from "~/lib/seo";

export function meta({ loaderData }: Route.MetaArgs) {
  const t = uiCopy(loaderData?.locale ?? "zh-CN");
  return [
    { title: t.metaTitle },
    { name: "description", content: t.metaDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl("/", loaderData?.page) },
    { name: "robots", content: loaderData && !loaderData.filtered ? "index,follow" : "noindex,follow" },
  ];
}
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const page = readPage(url.searchParams);
  if (url.searchParams.has("page") && page === 1) {
    throw redirect(pageHref(url, 1));
  }
  const locale = readUiLocale(request);
  const filters = readExploreFilters(url.searchParams);
  const result = await listExplorePrompts(env.DB, filters, locale, page);
  const filterKeys = ["category", "tag", "q", "model", "ratio", "source_language",
    "page", "ui_locale", "prompt_locale"];
  const knownFilterQuery = [...url.searchParams.keys()].every((key) => filterKeys.includes(key));
  const category = result.categories.find((item) =>
    item.slug.toLowerCase() === filters.category.toLowerCase());
  if (filters.category && !filters.tag && !filters.q && !filters.model && !filters.ratio && !filters.sourceLanguage
    && knownFilterQuery && category) {
    const target = new URL(`/category/${encodeURIComponent(category.slug)}`, url);
    if (page >= 2) target.searchParams.set("page", String(page));
    if (url.searchParams.has("ui_locale")) target.searchParams.set("ui_locale", locale);
    throw redirect(`${target.pathname}${target.search}`);
  }
  const tag = result.tags.find((item) =>
    item.slug.toLowerCase() === filters.tag.toLowerCase());
  if (filters.tag && !filters.category && !filters.q && !filters.model && !filters.ratio
    && !filters.sourceLanguage && knownFilterQuery && tag) {
    const target = new URL(`/tag/${encodeURIComponent(tag.slug)}`, url);
    if (page >= 2) target.searchParams.set("page", String(page));
    if (url.searchParams.has("ui_locale")) target.searchParams.set("ui_locale", locale);
    throw redirect(`${target.pathname}${target.search}`);
  }
  return { ...result, page, locale, filters, filtered: isDiscoveryQuery(url.searchParams),
    pageUrl: `${url.pathname}${url.search}`, imageBaseUrl: env.IMAGE_BASE_URL };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { cards, page, totalPages, categories, tags, models, ratios, locale, filters, pageUrl, imageBaseUrl } = loaderData;
  const t = uiCopy(locale);
  const url = new URL(pageUrl, "https://vault.disign.me");
  return (
    <>
      <SiteHeader locale={locale} filters={filters} url={url} />
      <main className="explore-main">
        <ExploreFiltersBar locale={locale} filters={filters} categories={categories} tags={tags} models={models} ratios={ratios} />
        {cards.length
          ? <PromptGrid prompts={cards} imageBaseUrl={imageBaseUrl} />
          : <section className="empty-state">
              <h2>{t.emptyTitle}</h2>
              <p>{t.emptyDescription}</p>
              <a href={`/?ui_locale=${locale}`}>{t.clear}</a>
            </section>}
        <Pagination url={url} page={page} totalPages={totalPages} locale={locale} />
      </main>
    </>
  );
}
