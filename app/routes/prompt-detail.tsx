import { env } from "cloudflare:workers";
import type { Route } from "./+types/prompt-detail";
import { SiteHeader } from "../components/site-header";
import { PromptDetailContent } from "../components/prompt-detail-content";
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
  return (
    <>
      <SiteHeader locale={locale} url={new URL(pageUrl, "https://vault.disign.me")} />
      <main>
        <PromptDetailContent prompt={prompt} locale={locale} pageUrl={pageUrl} imageUrl={imageUrl}
          backHref={`/?ui_locale=${locale}`} backLabel={uiCopy(locale).backToExplore} />
      </main>
    </>
  );
}
