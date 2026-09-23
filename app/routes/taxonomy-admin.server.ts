import { data, redirect } from "react-router";
import { readUiLocale } from "../lib/explore";
import { mutateTaxonomyAdmin, TaxonomyAdminError, type TaxonomyKind } from "../services/taxonomy-admin.server";

export async function taxonomyAdminAction(request: Request, db: D1Database, kind: TaxonomyKind) {
  try {
    await mutateTaxonomyAdmin(db, kind, await request.formData());
  } catch (error) {
    if (error instanceof TaxonomyAdminError) {
      return data({ error: error.code }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return data({ error: "failed" as const }, {
      status: 500, headers: { "Cache-Control": "no-store" },
    });
  }
  const locale = readUiLocale(request);
  const url = new URL(request.url);
  const suffix = url.searchParams.has("ui_locale") ? `?ui_locale=${locale}` : "";
  return redirect(`/admin/${kind === "category" ? "categories" : "tags"}${suffix}`, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}


