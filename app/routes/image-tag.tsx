import type { Route } from "./+types/image-tag";
import { loadExplore } from "./explore-page.server";
import { ExplorePage, taxonomyMeta } from "./explore-page";

export function meta({ loaderData }: Route.MetaArgs) {
  return taxonomyMeta(loaderData);
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadExplore(request, { kind: "tag", slug: params.slug });
}

export default function ImageTagPage({ loaderData }: Route.ComponentProps) {
  return <ExplorePage loaderData={loaderData} />;
}
