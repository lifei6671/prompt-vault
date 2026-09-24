import type { Route } from "./+types/tag";
import { loadExplore } from "./explore-page.server";
import { ExplorePage, taxonomyMeta } from "./explore-page";

export function meta({ loaderData }: Route.MetaArgs) {
  return taxonomyMeta(loaderData);
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadExplore(request, { kind: "tag", slug: params.slug });
}

export default function TagPage({ loaderData }: Route.ComponentProps) {
  return <ExplorePage loaderData={loaderData} />;
}
