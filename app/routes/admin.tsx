import { env } from "cloudflare:workers";
import { Outlet } from "react-router";
import type { Route } from "./+types/admin";
import { adminTaxonomyCopy, uiCopy } from "../lib/ui-copy";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { guardAdminRequest, loadAdmin } from "../services/admin-route.server";

export const meta: Route.MetaFunction = () => [
  { title: "Admin · PromptVault" },
  { name: "robots", content: "noindex,nofollow" },
];

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export const middleware: Route.MiddlewareFunction[] = [
  ({ request }, next) => guardAdminRequest(request, env, next),
];

export function loader({ request }: Route.LoaderArgs) {
  return loadAdmin(request, env);
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const t = uiCopy(loaderData.locale);
  const admin = adminTaxonomyCopy(loaderData.locale);
  const promptAdmin = adminPromptCopy(loaderData.locale);
  return (
    <>
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <a className="font-semibold" href="/admin">PromptVault Admin</a>
          <a className="text-sm underline" href="/">{t.backToExplore}</a>
        </div>
      </header>
      <nav aria-label={admin.navigation} className="mx-auto flex max-w-4xl flex-wrap gap-4 px-6 pt-4 text-sm"><a href="/admin/prompts" className="underline">{promptAdmin.prompts}</a><a href="/admin/categories" className="underline">{admin.categories}</a><a href="/admin/tags" className="underline">{admin.tags}</a></nav>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <Outlet context={loaderData.locale} />
      </main>
    </>
  );
}


