import { env } from "cloudflare:workers";
import { useState } from "react";
import { data, Form, redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/admin-prompt-new";
import type { Locale } from "../lib/localization";
import { usePromptImageUpload } from "../lib/use-prompt-image-upload";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { listPromptTaxonomy, PromptAdminError } from "../services/prompt-admin.server";
import { createAdminPrompt } from "../services/prompt-create.server";
import { UploadError } from "../services/image-upload.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });
export async function loader() {
  return data({ taxonomy: await listPromptTaxonomy(env.DB) }, { headers: { "Cache-Control": "no-store" } });
}
export async function action({ request }: Route.ActionArgs) {
  try {
    const id = await createAdminPrompt(env.DB, env.IMAGES, await request.formData());
    const url = new URL(request.url);
    const suffix = url.searchParams.has("ui_locale") ? `?ui_locale=${url.searchParams.get("ui_locale")}` : "";
    return redirect(`/admin/prompts/${id}/edit${suffix}`, {
      status: 303, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PromptAdminError || error instanceof UploadError)
      return data({ error: error.code }, {
        status: error.status, headers: { "Cache-Control": "no-store" },
      });
    console.error("Prompt create failed", { error: error instanceof Error ? error.name : "unknown" });
    return data({ error: "failed" as const }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
const input = "w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const label = "block space-y-1 text-sm font-medium";
const panel = "space-y-4 rounded-md border border-border bg-white p-5";
export default function AdminPromptNew({ loaderData, actionData }: Route.ComponentProps) {
  const locale = useOutletContext<Locale>();
  const t = adminPromptCopy(locale);
  const [source, setSource] = useState<Locale | "">("");
  const { reference, state: uploadState, previewUrl, onImage } = usePromptImageUpload();
  const target = source === "zh-CN" ? "en-US" : "zh-CN";
  return <section className="space-y-7">
    <a className="text-sm text-primary underline" href="/admin/prompts">← {t.back}</a>
    <h1 className="text-3xl font-semibold">{t.create}</h1>
    {actionData?.error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {actionData.error === "tokens" ? t.tokens : actionData.error === "missingUpload" ? t.missingUpload :
        actionData.error === "tooLarge" ? t.tooLarge : t[actionData.error]}
    </p>}
    <Form method="post" className="space-y-6">
      <input type="hidden" name="upload_reference" value={reference} />
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.uploadImage}</h2>
        <label className={label}>{t.originalImage}
          <input className={input} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void onImage(event.currentTarget.files?.[0])} />
        </label>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {uploadState === "idle" ? t.chooseImage : uploadState === "uploading" ? t.uploading :
            uploadState === "ready" ? t.uploadReady : t.uploadFailed}
        </p>
        {previewUrl && <img className="max-h-64 rounded-md object-contain" src={previewUrl} alt={t.previewImage} />}
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.original}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>{t.sourceLanguage}
            <select className={input} name="source_language" required value={source}
              onChange={(event) => setSource(event.target.value as Locale)}>
              <option value="">{t.chooseLanguage}</option>
              <option value="zh-CN">zh-CN</option><option value="en-US">en-US</option>
            </select>
          </label>
          <label className={label}>{t.slug}<input className={input} name="slug" required maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label className={label}>{t.title}<input className={input} name="title" required maxLength={200} /></label>
          <label className={label}>{t.model}<input className={input} name="model" maxLength={120} /></label>
          <label className={label}>{t.ratio}<input className={input} name="ratio" maxLength={60} /></label>
          <label className={label}>{t.category}<select className={input} name="category_id" required defaultValue="">
            <option value="">{t.chooseCategory}</option>
            {loaderData.taxonomy.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
        </div>
        <label className={label}>{t.description}<textarea className={input} name="description" rows={3} maxLength={2000} /></label>
        <label className={label}>{t.template}<textarea className={input} name="prompt_template" rows={10} required maxLength={50000} /></label>
        <label className={label}>{t.imageAlt}<input className={input} name="image_alt" required maxLength={500} /></label>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.translation} · {target}</h2>
        <input type="hidden" name="translation_locale" value={target} />
        <label className={label}>{t.translationMode}<select className={input} name="translation_mode" defaultValue="remove">
          <option value="present">{t.present}</option><option value="remove">{t.remove}</option>
        </select></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>{t.title}<input className={input} name="translation_title" maxLength={200} /></label>
          <label className={label}>{t.imageAlt}<input className={input} name="translation_image_alt" maxLength={500} /></label>
        </div>
        <label className={label}>{t.description}<textarea className={input} name="translation_description" rows={3} maxLength={2000} /></label>
        <label className={label}>{t.template}<textarea className={input} name="translation_prompt_template" rows={10} maxLength={50000} /></label>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.variables}</h2>
        <p className="text-sm text-muted-foreground">{t.variablesHelp}</p>
        <label className={label}>{t.variables}<textarea className={input + " font-mono"} name="variables_json"
          defaultValue="[]" rows={14} spellCheck={false} /></label>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.tags}</h2>
        <div className="flex flex-wrap gap-4">{loaderData.taxonomy.tags.map((tag) =>
          <label key={tag.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tag_ids" value={tag.id} />{tag.name}
          </label>)}</div>
      </section>
      <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        type="submit" disabled={uploadState !== "ready" || !source}>{t.createDraft}</button>
    </Form>
  </section>;
}
