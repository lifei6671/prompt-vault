import { env } from "cloudflare:workers";
import { data, Form, redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/admin-prompt-edit";
import type { Locale } from "../lib/localization";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { getAdminPrompt, listPromptTaxonomy, mutateAdminPrompt, parsePromptId, PromptAdminError } from "../services/prompt-admin.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });
export async function loader({ params }: Route.LoaderArgs) {
  try {
    const id = parsePromptId(params.id);
    const [prompt, taxonomy] = await Promise.all([
      getAdminPrompt(env.DB, id), listPromptTaxonomy(env.DB),
    ]);
    return data({ prompt, taxonomy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PromptAdminError)
      throw new Response(error.code, { status: error.status, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
export async function action({ request, params }: Route.ActionArgs) {
  try {
    const id = parsePromptId(params.id);
    await mutateAdminPrompt(env.DB, id, await request.formData());
    const url = new URL(request.url);
    const suffix = url.searchParams.has("ui_locale") ? `?ui_locale=${url.searchParams.get("ui_locale")}` : "";
    return redirect(`/admin/prompts/${id}/edit${suffix}`, {
      status: 303, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PromptAdminError) return data({ error: error.code }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
    return data({ error: "failed" as const }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
const input = "w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";
const label = "block space-y-1 text-sm font-medium";
const panel = "space-y-4 rounded-md border border-border bg-white p-5";
const button = "rounded-md border border-border px-4 py-2 text-sm font-medium";
export default function AdminPromptEdit({ loaderData, actionData }: Route.ComponentProps) {
  const t = adminPromptCopy(useOutletContext<Locale>());
  const { prompt, taxonomy } = loaderData;
  const target = prompt.source_language === "zh-CN" ? "en-US" : "zh-CN";
  const status = prompt.deleted_at ? t.deleted : prompt.status === "published" ? t.published : t.draft;
  const editable = !prompt.deleted_at;
  const translated = prompt.translation;
  return <section className="space-y-7">
    <a className="text-sm text-primary underline" href="/admin/prompts">← {t.back}</a>
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h1 className="text-3xl font-semibold">{t.edit}: {prompt.title}</h1>
      <span className="text-sm font-medium">{t.status}: {status}</span>
    </div>
    {actionData?.error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {actionData.error === "deleted" ? t.deletedError : actionData.error === "slugFrozen" ? t.slugFrozen :
        actionData.error === "tokens" ? t.tokens : t[actionData.error]}
    </p>}
    <Form method="post" className="space-y-6">
      <input type="hidden" name="_intent" value="save" />
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.original} · {prompt.source_language}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>{t.slug}<input className={input} name="slug" defaultValue={prompt.slug}
            readOnly={!!prompt.published_at || !editable} required maxLength={80} /></label>
          <label className={label}>{t.title}<input className={input} name="title" defaultValue={prompt.title}
            disabled={!editable} required maxLength={200} /></label>
          <label className={label}>{t.model}<input className={input} name="model" defaultValue={prompt.model ?? ""}
            disabled={!editable} maxLength={120} /></label>
          <label className={label}>{t.ratio}<input className={input} name="ratio" defaultValue={prompt.ratio ?? ""}
            disabled={!editable} maxLength={60} /></label>
          <label className={label}>{t.category}<select className={input} name="category_id" defaultValue={prompt.category_id} disabled={!editable}>
            {taxonomy.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
        </div>
        {!!prompt.published_at && <p className="text-sm text-muted-foreground">{t.slugFrozen}</p>}
        <label className={label}>{t.description}<textarea className={input} name="description" rows={3}
          defaultValue={prompt.description ?? ""} disabled={!editable} maxLength={2000} /></label>
        <label className={label}>{t.template}<textarea className={input} name="prompt_template" rows={10}
          defaultValue={prompt.prompt_template} disabled={!editable} required maxLength={50000} /></label>
        <label className={label}>{t.imageAlt}<input className={input} name="image_alt"
          defaultValue={prompt.image_alt} disabled={!editable} required maxLength={500} /></label>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.translation} · {target}</h2>
        <input type="hidden" name="translation_locale" value={target} />
        <label className={label}>{t.translationMode}<select className={input} name="translation_mode"
          defaultValue={translated ? "present" : "remove"} disabled={!editable}>
          <option value="present">{t.present}</option><option value="remove">{t.remove}</option>
        </select></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>{t.title}<input className={input} name="translation_title"
            defaultValue={translated?.title ?? ""} disabled={!editable} maxLength={200} /></label>
          <label className={label}>{t.imageAlt}<input className={input} name="translation_image_alt"
            defaultValue={translated?.image_alt ?? ""} disabled={!editable} maxLength={500} /></label>
        </div>
        <label className={label}>{t.description}<textarea className={input} name="translation_description"
          defaultValue={translated?.description ?? ""} disabled={!editable} maxLength={2000} rows={3} /></label>
        <label className={label}>{t.template}<textarea className={input} name="translation_prompt_template"
          defaultValue={translated?.prompt_template ?? ""} disabled={!editable} maxLength={50000} rows={10} /></label>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.variables}</h2>
        <p className="text-sm text-muted-foreground">{t.variablesHelp}</p>
        <details className="text-sm"><summary className="cursor-pointer text-primary underline">{t.example}</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3">{JSON.stringify([
            { key: "subject", type: "text", label: prompt.source_language === "zh-CN" ? "主体" : "Subject", placeholder: null,
              translation_label: target === "zh-CN" ? "主体" : "Subject", translation_placeholder: null, options: null },
            { key: "style", type: "select", label: prompt.source_language === "zh-CN" ? "风格" : "Style", placeholder: null,
              translation_label: target === "zh-CN" ? "风格" : "Style", translation_placeholder: null,
              options: [{ value: "retro", labels: { "zh-CN": "复古", "en-US": "Retro" } }] },
          ], null, 2)}</pre>
        </details>
        <label className={label}>{t.variables}<textarea className={input + " font-mono"} name="variables_json"
          defaultValue={JSON.stringify(prompt.variables, null, 2)} disabled={!editable} rows={14} spellCheck={false} /></label>
      </section>
      <section className={panel}>
        <h2 className="text-lg font-semibold">{t.tags}</h2>
        <div className="flex flex-wrap gap-4">{taxonomy.tags.map((tag) =>
          <label key={tag.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tag_ids" value={tag.id} defaultChecked={prompt.tagIds.includes(tag.id)}
              disabled={!editable} />{tag.name}
          </label>)}</div>
      </section>
      {editable && <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white" type="submit">{t.save}</button>}
    </Form>
    <section className={panel}>
      <h2 className="text-lg font-semibold">{t.imageMetadata}</h2>
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div><dt>Original key</dt><dd className="break-all font-mono">{prompt.original_image_key}</dd></div>
        <div><dt>Preview key</dt><dd className="break-all font-mono">{prompt.preview_image_key}</dd></div>
        <div><dt>Content-Type</dt><dd>{prompt.original_content_type}</dd></div>
        <div><dt>Original</dt><dd>{prompt.original_width} × {prompt.original_height} · {prompt.original_size_bytes} B</dd></div>
        <div><dt>Preview</dt><dd>{prompt.preview_width} × {prompt.preview_height} · {prompt.preview_size_bytes} B</dd></div>
      </dl>
    </section>
    {editable && <section className={panel}>
      <h2 className="text-lg font-semibold">{t.status}: {status}</h2>
      <p className="text-sm text-muted-foreground">{t.saveFirst}</p>
      <div className="flex flex-wrap gap-3">
        {prompt.status === "draft" && <Form method="post"><input type="hidden" name="_intent" value="publish" />
          <button className={button} type="submit">{t.publish}</button></Form>}
        {prompt.status === "published" && <Form method="post"><input type="hidden" name="_intent" value="withdraw" />
          <button className={button} type="submit">{t.withdraw}</button></Form>}
        <Form method="post"><input type="hidden" name="_intent" value="delete" />
          <button className={button} type="submit">{t.softDelete}</button></Form>
      </div>
    </section>}
  </section>;
}
