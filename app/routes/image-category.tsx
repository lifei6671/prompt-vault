import type { Route } from "./+types/image-category";
import { loadExplore } from "./explore-page.server";
import { ExplorePage, taxonomyMeta } from "./explore-page";

export function meta({ loaderData }: Route.MetaArgs) {
  return taxonomyMeta(loaderData);
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadExplore(request, { kind: "category", slug: params.slug });
}

export default function ImageCategoryPage({ loaderData }: Route.ComponentProps) {
  return <ExplorePage loaderData={loaderData} />;
}
