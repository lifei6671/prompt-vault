import { env } from "cloudflare:workers";
import { data, useOutletContext } from "react-router";
import type { Route } from "./+types/admin-prompts";
import type { Locale } from "../lib/localization";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { listAdminPrompts } from "../services/prompt-admin.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });
export async function loader() {
  return data({ items: await listAdminPrompts(env.DB) }, { headers: { "Cache-Control": "no-store" } });
}
export default function AdminPrompts({ loaderData }: Route.ComponentProps) {
  const t = adminPromptCopy(useOutletContext<Locale>());
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-semibold">{t.prompts}</h1><a className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white" href="/admin/prompts/new">{t.create}</a></div>
    {loaderData.items.length === 0 ? <p className="text-muted-foreground">{t.empty}</p> :
      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>{[t.slug, t.title, t.status, t.category, t.model, t.ratio, t.publishedAt, t.updatedAt, t.edit]
              .map((heading) => <th key={heading} scope="col" className="px-3 py-3 font-semibold">{heading}</th>)}</tr>
          </thead>
          <tbody>{loaderData.items.map((item) => {
            const status = item.deleted_at ? t.deleted : item.status === "published" ? t.published : t.draft;
            return <tr key={item.id} className="border-b border-border last:border-0">
              <td className="px-3 py-3 font-mono text-xs">{item.slug}</td>
              <td className="px-3 py-3">{item.title}</td>
              <td className="px-3 py-3">{status}</td>
              <td className="px-3 py-3">{item.category_name}</td>
              <td className="px-3 py-3">{item.model ?? "—"}</td>
              <td className="px-3 py-3">{item.ratio ?? "—"}</td>
              <td className="px-3 py-3">{item.published_at ?? "—"}</td>
              <td className="px-3 py-3">{item.updated_at}</td>
              <td className="px-3 py-3"><a className="text-primary underline" href={`/admin/prompts/${item.id}/edit`}>{t.edit}</a></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
  </section>;
}
