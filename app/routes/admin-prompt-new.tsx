import { env } from "cloudflare:workers";
import { useMemo, useState } from "react";
import { data, Form, redirect, useOutletContext } from "react-router";
import type { Route } from "./+types/admin-prompt-new";
import type { Locale } from "../lib/localization";
import { parsePromptImport, stableHash } from "../lib/prompt-import";
import { usePromptImageUpload } from "../lib/use-prompt-image-upload";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { AdminPromptFields } from "../components/admin-prompt-fields";
import { listPromptTaxonomy, PromptAdminError } from "../services/prompt-admin.server";
import { createAdminPrompt } from "../services/prompt-create.server";
import { createImportedPrompt } from "../services/prompt-import.server";
import { UploadError } from "../services/image-upload.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });
export async function loader() {
  const [taxonomy, categories, tags] = await Promise.all([
    listPromptTaxonomy(env.DB),
    env.DB.prepare("SELECT name FROM category_translations").all<{ name: string }>(),
    env.DB.prepare("SELECT name FROM tag_translations").all<{ name: string }>(),
  ]);
  return data({ taxonomy, categoryTranslations: categories.results.map((row) => row.name),
    tagTranslations: tags.results.map((row) => row.name) }, { headers: { "Cache-Control": "no-store" } });
}
export async function action({ request }: Route.ActionArgs) {
  try {
    const form = await request.formData();
    const id = form.get("_mode") === "import" || form.get("_mode") === "import_advanced"
      ? await createImportedPrompt(env.DB, env.IMAGES, form)
      : await createAdminPrompt(env.DB, env.IMAGES, form);
    const url = new URL(request.url);
    const suffix = url.searchParams.has("ui_locale") ? "?ui_locale=" + url.searchParams.get("ui_locale") : "";
    return redirect("/admin/prompts/" + id + "/edit" + suffix, {
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
export default function AdminPromptNew({ loaderData, actionData }: Route.ComponentProps) {
  const locale = useOutletContext<Locale>();
  const t = adminPromptCopy(locale);
  const [document, setDocument] = useState("");
  const [revision, setRevision] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [source, setSource] = useState<Locale | "">("");
  const { reference, state: uploadState, previewUrl, fileName, originalWidth, originalHeight,
    detectedRatio, onImage } = usePromptImageUpload();
  const parsed = useMemo(() => document.trim() ? parsePromptImport(document, detectedRatio) : null,
    [document, detectedRatio, revision]);
  const mode = !document.trim() ? "manual" : advancedOpen ? "import_advanced" : "import";
  const ready = uploadState === "ready" && (mode === "import" ? !!parsed && parsed.errors.length === 0 : !!source);
  const categories = new Set([...loaderData.taxonomy.categories.map((item) => item.name), ...loaderData.categoryTranslations]);
  const tags = new Set([...loaderData.taxonomy.tags.map((item) => item.name), ...loaderData.tagTranslations]);
  const imageStatus = uploadState === "idle" ? t.chooseImage : uploadState === "uploading" ? t.uploading :
    uploadState === "ready" ? t.uploadReady : t.uploadFailed;
  function acceptImage(file: File | undefined) {
    if (file) void onImage(file);
  }
  return <section className="admin-editor-page admin-editor-new" aria-labelledby="admin-editor-title"
    onPaste={(event) => {
      const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
      if (image) { event.preventDefault(); acceptImage(image); }
    }}>
    <header className="admin-editor-header">
      <div className="admin-editor-heading"><a className="admin-back-link" href="/admin/prompts">← {t.back}</a>
        <h1 id="admin-editor-title">{t.create}</h1><span className="admin-status admin-status-draft">{t.draft}</span></div>
    </header>
    {actionData?.error && <p role="alert" className="admin-form-error">
      {actionData.error === "tokens" ? t.tokens : actionData.error === "missingUpload" ? t.missingUpload :
        actionData.error === "tooLarge" ? t.tooLarge : t[actionData.error]}
    </p>}
    <Form id="admin-prompt-form" method="post" className="admin-editor-main">
      <input type="hidden" name="_mode" value={mode} />
      <input type="hidden" name="upload_reference" value={reference} />
      <section className="admin-editor-panel" aria-labelledby="admin-import-title">
        <div className="admin-editor-panel-head"><h2 id="admin-import-title">{t.importDocument}</h2><span>{t.importHint}</span></div>
        <label className="admin-field">{t.importDocument}
          <textarea name="import_document" className="admin-import-textarea" rows={16} maxLength={100000} value={document} dir="auto"
            placeholder={t.importPlaceholder} onChange={(event) => {
              const next = event.currentTarget.value;
              setDocument(next);
              setSource(next.trim() ? parsePromptImport(next, detectedRatio).sourceLanguage : "");
            }} />
        </label>
        <button type="button" className="admin-secondary-action admin-reparse" onClick={() => setRevision((value) => value + 1)}
          disabled={!document.trim()}>{t.reparse}</button>
      </section>
      <section className="admin-editor-panel" aria-labelledby="admin-image-title">
        <div className="admin-editor-panel-head"><h2 id="admin-image-title">{t.uploadImage}</h2><span>{t.imageGenerated}</span></div>
        <div className="admin-import-dropzone" onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); acceptImage(event.dataTransfer.files[0]); }}>
          <label className="admin-field">{t.originalImage}<input type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(event) => { acceptImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
          <p className="admin-field-note">{t.dropOrPaste}</p>
        </div>
        <p aria-live="polite" className="admin-field-note">{imageStatus}</p>
        {previewUrl && <img className="admin-upload-preview" src={previewUrl} alt={t.previewImage} />}
        {fileName && <p className="admin-field-note">{fileName}
          {originalWidth > 0 && " · " + originalWidth + " × " + originalHeight + " · " + detectedRatio}</p>}
      </section>
      <section className="admin-editor-panel" aria-labelledby="admin-import-summary-title" aria-live="polite">
        <div className="admin-editor-panel-head"><h2 id="admin-import-summary-title">{t.importSummary}</h2></div>
        {parsed ? <>
          <dl className="admin-import-summary">
            <div><dt>{t.title}</dt><dd>{parsed.title || "—"}</dd></div>
            <div><dt>{t.slug}</dt><dd className="admin-slug">{parsed.slug}</dd></div>
            <div><dt>{t.category}</dt><dd>{parsed.category || "—"} {parsed.category && !categories.has(parsed.category) && <em>{t.willCreate}</em>}</dd></div>
            <div><dt>{t.tags}</dt><dd>{parsed.tags.length ? parsed.tags.map((tag) =>
              <span key={tag}>{tag}{!tags.has(tag) && <em>{t.willCreate}</em>} </span>) : "—"}</dd></div>
            <div><dt>{t.model}</dt><dd>{parsed.model || "—"}</dd></div>
            <div><dt>{t.ratio}</dt><dd>{parsed.ratio || "—"}</dd></div>
            <div><dt>{t.sourceLanguage}</dt><dd>{parsed.sourceLanguage}</dd></div>
            <div><dt>{t.variableCount}</dt><dd>{parsed.variables.length}</dd></div>
            <div><dt>{t.imageState}</dt><dd>{imageStatus}</dd></div>
          </dl>
          {parsed.errors.length > 0 && <p className="admin-form-error" role="alert">{t.importErrors}: {parsed.errors.map((key) =>
            t.importIssue[key as keyof typeof t.importIssue] ?? key).join(locale === "zh-CN" ? "、" : ", ")}</p>}
          {parsed.warnings.length > 0 && <p className="admin-field-note">{t.importWarnings}: {parsed.warnings.map((key) =>
            t.importIssue[key as keyof typeof t.importIssue] ?? key).join(locale === "zh-CN" ? "、" : ", ")}</p>}
        </> : <p className="admin-field-note">{t.summaryEmpty}</p>}
      </section>
      <details className="admin-import-advanced" onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
        <summary>{t.advancedEdit}</summary>
        <fieldset disabled={!advancedOpen} className="admin-import-fields">
          <AdminPromptFields key={mode + stableHash(document) + (advancedOpen ? "" : detectedRatio)} locale={locale} source={source}
            onSourceChange={setSource} taxonomy={loaderData.taxonomy} draft={parsed ?? undefined}
            importTaxonomy={!!document.trim()} editable />
        </fieldset>
      </details>
      <button className="admin-primary-action admin-import-create" type="submit" disabled={!ready}>{t.createDraft}</button>
    </Form>
  </section>;
}
