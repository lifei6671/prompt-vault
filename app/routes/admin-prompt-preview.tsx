import { env } from "cloudflare:workers";
import { data } from "react-router";
import type { Route } from "./+types/admin-prompt-preview";
import { PromptDetailContent } from "../components/prompt-detail-content";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { previewImageUrl, readUiLocale } from "../lib/explore";
import { getAdminPromptPreview } from "../services/prompt-detail.server";
import { parsePromptId, PromptAdminError } from "../services/prompt-admin.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData ? `${loaderData.prompt.title} · PromptVault Admin` : "Prompt Preview · PromptVault Admin" },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  try {
    const id = parsePromptId(params.id);
    const locale = readUiLocale(request);
    const url = new URL(request.url);
    const prompt = await getAdminPromptPreview(env.DB, id, locale, url.searchParams.get("prompt_locale"));
    return data({
      prompt, locale, id, pageUrl: url.pathname + url.search,
      imageUrl: previewImageUrl(env.IMAGE_BASE_URL, prompt.imageKey),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PromptAdminError)
      throw new Response(error.code, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof Response) {
      error.headers.set("Cache-Control", "no-store");
      throw error;
    }
    throw error;
  }
}

export default function AdminPromptPreview({ loaderData }: Route.ComponentProps) {
  const { prompt, locale, id, pageUrl, imageUrl } = loaderData;
  return <div className="admin-preview-page"><PromptDetailContent prompt={prompt} locale={locale} pageUrl={pageUrl} imageUrl={imageUrl}
    backHref={`/admin/prompts/${id}/edit?ui_locale=${locale}`}
    backLabel={adminPromptCopy(locale).edit} /></div>;
}