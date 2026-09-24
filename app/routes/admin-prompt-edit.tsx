import { env } from "cloudflare:workers";
import { data, Form, redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/admin-prompt-edit";
import type { Locale } from "../lib/localization";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { AdminPromptChecks, AdminPromptFields } from "../components/admin-prompt-fields";
import { usePromptImageUpload } from "../lib/use-prompt-image-upload";
import { UploadError } from "../services/image-upload.server";
import { replacePromptImage } from "../services/prompt-image.server";
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
    const form = await request.formData();
    if (form.get("_intent") === "replace_image")
      await replacePromptImage(env.DB, env.IMAGES, id, form);
    else await mutateAdminPrompt(env.DB, id, form);
    const url = new URL(request.url);
    const suffix = url.searchParams.has("ui_locale") ? `?ui_locale=${url.searchParams.get("ui_locale")}` : "";
    return redirect(`/admin/prompts/${id}/edit${suffix}`, {
      status: 303, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PromptAdminError || error instanceof UploadError) return data({ error: error.code }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
    return data({ error: "failed" as const }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
export default function AdminPromptEdit({ loaderData, actionData }: Route.ComponentProps) {
  const locale = useOutletContext<Locale>();
  const t = adminPromptCopy(locale);
  const { reference, state: uploadState, previewUrl, onImage } = usePromptImageUpload();
  const { prompt, taxonomy } = loaderData;
  const status = prompt.deleted_at ? t.deleted : prompt.status === "published" ? t.published : t.draft;
  const statusKey = prompt.deleted_at ? "deleted" : prompt.status;
  const editable = !prompt.deleted_at;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const formatDate = (value: string | null) => {
    if (!value) return t.neverPublished;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : date.format(parsed);
  };
  return <section className="admin-editor-page" aria-labelledby="admin-editor-title">
    <header className="admin-editor-header">
      <div className="admin-editor-heading"><a className="admin-back-link" href="/admin/prompts">← {t.back}</a>
        <h1 id="admin-editor-title">{prompt.title}</h1><span className={`admin-status admin-status-${statusKey}`}>{status}</span></div>
      <div className="admin-editor-actions">
        {editable && <a className="admin-secondary-action" href={`/admin/prompts/${prompt.id}/preview?ui_locale=${locale}`}>{t.previewPrompt}</a>}
        {editable && <button className="admin-primary-action" type="submit" form="admin-prompt-form">{t.save}</button>}
      </div>
    </header>
    {actionData?.error && <p role="alert" className="admin-form-error">
      {actionData.error === "deleted" ? t.deletedError : actionData.error === "slugFrozen" ? t.slugFrozen :
        actionData.error === "tokens" ? t.tokens : actionData.error === "missingUpload" ? t.missingUpload :
        actionData.error === "tooLarge" ? t.tooLarge : t[actionData.error]}
    </p>}
    {prompt.deleted_at && <p className="admin-field-note" role="status">{t.readOnly}</p>}
    <div className="admin-editor-layout">
      <div className="admin-editor-main">
        <Form id="admin-prompt-form" method="post" className="admin-editor-main">
          <input type="hidden" name="_intent" value="save" />
          <AdminPromptFields locale={locale} source={prompt.source_language} taxonomy={taxonomy} prompt={prompt} editable={editable} />
        </Form>
        <section className="admin-editor-panel" aria-labelledby="admin-image-title">
          <div className="admin-editor-panel-head"><h2 id="admin-image-title">{t.imageMetadata}</h2></div>
          <dl className="admin-image-meta">
            <div><dt>{t.imageOriginalKey}</dt><dd className="admin-mono">{prompt.original_image_key}</dd></div>
            <div><dt>{t.imagePreviewKey}</dt><dd className="admin-mono">{prompt.preview_image_key}</dd></div>
            <div><dt>{t.imageMime}</dt><dd>{prompt.original_content_type}</dd></div>
            <div><dt>{t.imageOriginalSize}</dt><dd>{prompt.original_width} × {prompt.original_height} · {new Intl.NumberFormat(locale).format(prompt.original_size_bytes)} B</dd></div>
            <div><dt>{t.imagePreviewSize}</dt><dd>{prompt.preview_width} × {prompt.preview_height} · {new Intl.NumberFormat(locale).format(prompt.preview_size_bytes)} B</dd></div>
          </dl>
          {editable && <div className="admin-image-replace">
            <h3>{t.replaceImage}</h3>
            <label className="admin-field">{t.originalImage}<input type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void onImage(event.currentTarget.files?.[0])} /></label>
            <p aria-live="polite" className="admin-field-note">
              {uploadState === "idle" ? t.chooseImage : uploadState === "uploading" ? t.uploading :
                uploadState === "ready" ? t.replaceReady : t.uploadFailed}
            </p>
            {previewUrl && <img className="admin-upload-preview" src={previewUrl} alt={t.previewImage} />}
            <Form method="post"><input type="hidden" name="_intent" value="replace_image" />
              <input type="hidden" name="upload_reference" value={reference} />
              <button className="admin-secondary-action" type="submit" disabled={uploadState !== "ready"}>{t.replaceImage}</button>
            </Form>
          </div>}
        </section>
      </div>
      <aside className="admin-editor-side" aria-label={t.lifecycle}>
        <section className="admin-side-panel"><div className="admin-side-heading"><h2>{t.lifecycle}</h2>
          <span className={`admin-status admin-status-${statusKey}`}>{status}</span></div>
          <dl className="admin-lifecycle">
            <div><dt>{t.createdAt}</dt><dd>{formatDate(prompt.created_at)}</dd></div>
            <div><dt>{t.updatedAt}</dt><dd>{formatDate(prompt.updated_at)}</dd></div>
            <div><dt>{t.publishedAt}</dt><dd>{formatDate(prompt.published_at)}</dd></div>
          </dl></section>
        <AdminPromptChecks prompt={prompt} locale={locale} />
        {editable && <section className="admin-side-panel admin-publish-panel"><h2>{t.status}</h2>
          <p className="admin-field-note">{t.saveFirst}</p>
          {prompt.status === "draft" && <Form method="post"><input type="hidden" name="_intent" value="publish" />
            <button className="admin-primary-action" type="submit">{t.publish}</button></Form>}
          {prompt.status === "published" && <Form method="post"><input type="hidden" name="_intent" value="withdraw" />
            <button className="admin-secondary-action" type="submit">{t.withdraw}</button></Form>}
          <Form method="post"><input type="hidden" name="_intent" value="delete" />
            <button className="admin-danger-action" type="submit">{t.softDelete}</button></Form>
        </section>}
      </aside>
    </div>
  </section>;
}
