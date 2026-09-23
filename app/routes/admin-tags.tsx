import { env } from "cloudflare:workers";
import { data } from "react-router";
import type { Route } from "./+types/admin-tags";
import { listTaxonomyAdmin } from "../services/taxonomy-admin.server";
import { taxonomyAdminAction } from "./taxonomy-admin.server";
import TaxonomyAdminPage from "./taxonomy-admin";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export async function loader() {
  return data({ items: await listTaxonomyAdmin(env.DB, "tag") },
    { headers: { "Cache-Control": "no-store" } });
}

export function action({ request }: Route.ActionArgs) {
  return taxonomyAdminAction(request, env.DB, "tag");
}

export default function AdminTags({ loaderData, actionData }: Route.ComponentProps) {
  return <TaxonomyAdminPage kind="tag" items={loaderData.items} error={actionData?.error} />;
}

