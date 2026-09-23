import { Pagination } from "../components/pagination";
import { PromptGrid } from "../components/prompt-grid";
import { SiteHeader } from "../components/site-header";
import { uiCopy } from "../lib/ui-copy";
import { canonicalUrl, isDiscoveryQuery } from "../lib/seo";
import type { loadTaxonomy } from "./taxonomy-page.server";

export function taxonomyMeta(data: Awaited<ReturnType<typeof loadTaxonomy>> | undefined) {
  if (!data) return [];
  const t = uiCopy(data.locale);
  const title = data.kind === "category" ? t.category : t.tags;
  const description = data.description ?? (data.kind === "category"
    ? t.categoryMetaDescription : t.tagMetaDescription).replace("{name}", data.name);
  return [
    { title: `${data.name} · ${title} · PromptVault` },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonicalUrl(
      `/${data.kind}/${encodeURIComponent(data.slug)}`, data.page) },
    { name: "robots", content: isDiscoveryQuery(new URL(data.pageUrl,
      "https://vault.disign.me").searchParams) ? "noindex,follow" : "index,follow" },
  ];
}

export default function TaxonomyPage(data: Awaited<ReturnType<typeof loadTaxonomy>>) {
  const { kind, name, description, contentLanguage, cards, page, totalPages,
    locale, pageUrl, imageBaseUrl } = data;
  const t = uiCopy(locale);
  const url = new URL(pageUrl, "https://vault.disign.me");
  return (
    <>
      <SiteHeader locale={locale} url={url} />
      <main className="explore-main taxonomy-main">
        <header className="taxonomy-heading">
          <p lang={locale}>{kind === "category" ? t.category : t.tags}</p>
          <h1 lang={contentLanguage}>{kind === "tag" && "#"}{name}</h1>
          {description && <p className="taxonomy-description" lang={contentLanguage}>{description}</p>}
        </header>
        {cards.length
          ? <PromptGrid prompts={cards} imageBaseUrl={imageBaseUrl} />
          : <section className="empty-state"><h2>{t.emptyTaxonomyTitle}</h2>
              <p>{t.emptyTaxonomyDescription}</p></section>}
        <Pagination url={url} page={page} totalPages={totalPages} locale={locale} />
      </main>
    </>
  );
}
