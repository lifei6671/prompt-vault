import type { Route } from "./+types/image";
import { canonicalUrl } from "~/lib/seo";
import { uiCopy } from "~/lib/ui-copy";
import { loadExplore } from "./explore-page.server";
import { ExplorePage } from "./explore-page";

export function meta({ loaderData }: Route.MetaArgs) {
  const t = uiCopy(loaderData?.locale ?? "zh-CN");
  return [
    { title: t.images + " · PromptVault" },
    { name: "description", content: t.metaDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl("/image", loaderData?.filtered ? 1 : loaderData?.page) },
    { name: "robots", content: loaderData && !loaderData.filtered ? "index,follow" : "noindex,follow" },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  return loadExplore(request);
}

export default function Image({ loaderData }: Route.ComponentProps) {
  return <ExplorePage loaderData={loaderData} />;
}
