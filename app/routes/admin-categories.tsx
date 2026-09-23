import { env } from "cloudflare:workers";
import { data } from "react-router";
import type { Route } from "./+types/admin-categories";
import { listTaxonomyAdmin } from "../services/taxonomy-admin.server";
import { taxonomyAdminAction } from "./taxonomy-admin.server";
import TaxonomyAdminPage from "./taxonomy-admin";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export async function loader() {
  return data({ items: await listTaxonomyAdmin(env.DB, "category") },
    { headers: { "Cache-Control": "no-store" } });
}

export function action({ request }: Route.ActionArgs) {
  return taxonomyAdminAction(request, env.DB, "category");
}

export default function AdminCategories({ loaderData, actionData }: Route.ComponentProps) {
  return <TaxonomyAdminPage kind="category" items={loaderData.items} error={actionData?.error} />;
}

