import { env } from "cloudflare:workers";
import type { Route } from "./+types/prompt-detail";
import { SiteHeader } from "../components/site-header";
import { PromptInteraction } from "../components/prompt-interaction";
import { previewImageUrl, readUiLocale } from "../lib/explore";
import { uiCopy } from "../lib/ui-copy";
import { getPromptDetail } from "../services/prompt-detail.server";
import { canonicalUrl } from "../lib/seo";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  return [
    { title: `${loaderData.prompt.title} · PromptVault` },
    { name: "description", content: loaderData.prompt.description ?? loaderData.prompt.title },
    { tagName: "link", rel: "canonical", href: canonicalUrl(`/prompt/${encodeURIComponent(loaderData.prompt.slug)}`) },
    { name: "robots", content: "index,follow" },
    { property: "og:title", content: loaderData.prompt.title },
    { property: "og:description", content: loaderData.prompt.description ?? loaderData.prompt.title },
    { property: "og:url", content: canonicalUrl(`/prompt/${encodeURIComponent(loaderData.prompt.slug)}`) },
    { property: "og:image", content: loaderData.ogImageUrl },
    { property: "og:image:width", content: String(loaderData.prompt.previewWidth) },
    { property: "og:image:height", content: String(loaderData.prompt.previewHeight) },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readUiLocale(request);
  const url = new URL(request.url);
  const prompt = await getPromptDetail(env.DB, params.slug, locale, url.searchParams.get("prompt_locale"));
  return {
    prompt, locale, pageUrl: url.pathname + url.search,
    imageUrl: previewImageUrl(env.IMAGE_BASE_URL, prompt.imageKey),
    ogImageUrl: previewImageUrl(env.IMAGE_BASE_URL, prompt.previewImageKey),
  };
}

export default function PromptDetailPage({ loaderData }: Route.ComponentProps) {
  const { prompt, locale, pageUrl, imageUrl } = loaderData;
  const t = uiCopy(locale);
  return (
    <>
      <SiteHeader locale={locale} url={new URL(pageUrl, "https://vault.disign.me")} />
      <main className="detail-main">
        <a lang={locale} className="detail-back" href={`/?ui_locale=${locale}`}>← {t.backToExplore}</a>
        <div className="detail-layout">
          <div className="detail-visual">
            <img src={imageUrl} width={prompt.imageWidth} height={prompt.imageHeight}
              alt={prompt.imageAlt} />
          </div>
          <article className="detail-content" lang={prompt.contentLanguage}>
            <h1 lang={prompt.contentLanguage}>{prompt.title}</h1>
            {prompt.description && <p className="detail-description" lang={prompt.contentLanguage}>{prompt.description}</p>}
            <dl className="detail-meta" lang={locale}>
              {prompt.model && <div><dt>{t.model}</dt><dd>{prompt.model}</dd></div>}
              <div><dt>{t.category}</dt><dd>{prompt.categoryName}</dd></div>
              {prompt.ratio && <div><dt>{t.ratio}</dt><dd>{prompt.ratio}</dd></div>}
              <div><dt>{t.sourceLanguage}</dt><dd>{prompt.sourceLanguage === "zh-CN" ? "中文" : "English"}</dd></div>
            </dl>
            {prompt.tags.length > 0 && <ul className="detail-tags" lang={locale} aria-label={t.tags}>
              {prompt.tags.map((tag) => <li key={tag.slug}>#{tag.name}</li>)}
            </ul>}
            <PromptInteraction prompt={prompt} locale={locale} pageUrl={pageUrl} />
          </article>
        </div>
      </main>
    </>
  );
}


