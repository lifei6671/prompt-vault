import type { Route } from "./+types/category";
import TaxonomyPage, { taxonomyMeta } from "./taxonomy-page";
import { loadTaxonomy } from "./taxonomy-page.server";

export function meta({ loaderData }: Route.MetaArgs) {
  return taxonomyMeta(loaderData);
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadTaxonomy(request, params.slug, "category");
}

export default function CategoryPage({ loaderData }: Route.ComponentProps) {
  return <TaxonomyPage {...loaderData} />;
}
