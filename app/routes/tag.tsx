import type { Route } from "./+types/tag";
import TaxonomyPage, { taxonomyMeta } from "./taxonomy-page";
import { loadTaxonomy } from "./taxonomy-page.server";

export function meta({ loaderData }: Route.MetaArgs) {
  return taxonomyMeta(loaderData);
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadTaxonomy(request, params.slug, "tag");
}

export default function TagPage({ loaderData }: Route.ComponentProps) {
  return <TaxonomyPage {...loaderData} />;
}
