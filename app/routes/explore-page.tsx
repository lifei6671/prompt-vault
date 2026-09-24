import { SiteHeader } from "~/components/site-header";
import { ExploreFiltersBar } from "~/components/explore-filters";
import { PromptGrid } from "~/components/prompt-grid";
import { Pagination } from "~/components/pagination";
import { uiCopy } from "~/lib/ui-copy";
import { canonicalUrl } from "~/lib/seo";
import type { loadExplore } from "./explore-page.server";

export function ExplorePage({ loaderData }: { loaderData: Awaited<ReturnType<typeof loadExplore>> }) {
  const { cards, total, page, totalPages, categories, tags, models, ratios, locale, filters, pageUrl, imageBaseUrl, taxonomy } = loaderData;
  const t = uiCopy(locale);
  const url = new URL(pageUrl, "https://vault.disign.me");
  return (
    <>
      <SiteHeader locale={locale} filters={filters} url={url} />
      <main className="explore-main">
        {taxonomy && <header className="taxonomy-heading">
          <p lang={locale}>{taxonomy.kind === "category" ? t.category : t.tags}</p>
          <h1 lang={taxonomy.contentLanguage}>{taxonomy.kind === "tag" && "#"}{taxonomy.name}</h1>
          {taxonomy.description && <p className="taxonomy-description" lang={taxonomy.contentLanguage}>{taxonomy.description}</p>}
        </header>}
        <ExploreFiltersBar locale={locale} filters={filters} categories={categories} tags={tags} models={models} ratios={ratios} total={total} url={url} />
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


export function taxonomyMeta(data: Awaited<ReturnType<typeof loadExplore>> | undefined) {
  if (!data?.taxonomy) return [];
  const taxonomy = data.taxonomy;
  const t = uiCopy(data.locale);
  const title = taxonomy.kind === "category" ? t.category : t.tags;
  const description = taxonomy.description ?? (taxonomy.kind === "category"
    ? t.categoryMetaDescription : t.tagMetaDescription).replace("{name}", taxonomy.name);
  return [
    { title: taxonomy.name + " · " + title + " · PromptVault" },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical",
      href: canonicalUrl("/" + taxonomy.kind + "/" + encodeURIComponent(taxonomy.slug), data.filtered ? 1 : data.page) },
    { name: "robots", content: data.filtered ? "noindex,follow" : "index,follow" },
  ];
}
