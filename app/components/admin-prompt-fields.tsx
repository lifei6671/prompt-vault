import type { Locale } from "../lib/localization";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { scanPromptKeys } from "../lib/prompt-template";
import type { AdminPrompt } from "../services/prompt-admin.server";
import type { PromptImport } from "../lib/prompt-import";
import { Select } from "./ui/select";

type Taxonomy = { categories: { id: number; name: string }[]; tags: { id: number; name: string }[] };
type Props = {
  locale: Locale; source: Locale | ""; onSourceChange?: (value: Locale | "") => void;
  taxonomy: Taxonomy; prompt?: AdminPrompt; draft?: PromptImport; importTaxonomy?: boolean; editable: boolean;
};
const otherLocale = (locale: Locale) => locale === "zh-CN" ? "en-US" : "zh-CN";

export function AdminPromptFields({ locale, source, onSourceChange, taxonomy, prompt, draft, importTaxonomy, editable }: Props) {
  const t = adminPromptCopy(locale);
  const target = source ? otherLocale(source) : "";
  const translated = prompt?.translation;
  const disabled = !editable;
  return <>
    <section className="admin-editor-panel" aria-labelledby="admin-basic-title">
      <div className="admin-editor-panel-head"><h2 id="admin-basic-title">{t.basicInformation}</h2><span>{t.coreMetadata}</span></div>
      <div className="admin-editor-fields">
        {!prompt && <label className="admin-field">{t.sourceLanguage}<Select name="source_language" required value={source}
          onValueChange={(value) => onSourceChange?.(value as Locale | "")} ariaLabel={t.sourceLanguage}
          options={[{ value: "", label: t.chooseLanguage }, { value: "zh-CN", label: "zh-CN" },
            { value: "en-US", label: "en-US" }]} /></label>}
        <label className="admin-field">{t.slug}<input name="slug" defaultValue={prompt?.slug ?? draft?.slug} required maxLength={80}
          pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!prompt?.published_at || disabled} /></label>
        {importTaxonomy
          ? <label className="admin-field">{t.category}<input name="category_name" required defaultValue={draft?.category} maxLength={120} /></label>
          : <label className="admin-field">{t.category}<Select name="category_id" required defaultValue={String(prompt?.category_id ?? "")} disabled={disabled}
            ariaLabel={t.category} options={[{ value: "", label: t.chooseCategory },
              ...taxonomy.categories.map((item) => ({ value: String(item.id), label: item.name }))]} /></label>}
        <label className="admin-field">{t.model}<input name="model" defaultValue={prompt?.model ?? draft?.model ?? ""} maxLength={120} disabled={disabled} /></label>
        <label className="admin-field">{t.ratio}<input name="ratio" defaultValue={prompt?.ratio ?? draft?.ratio ?? ""} maxLength={60} disabled={disabled} /></label>
        <label className="admin-reference-field"><input type="checkbox" name="requires_reference_image" value="1"
          defaultChecked={prompt ? prompt.requires_reference_image === 1 : draft?.requiresReferenceImage ?? false}
          disabled={disabled} />{t.referenceImageRequired}</label>
      </div>
      {!!prompt?.published_at && <p className="admin-field-note">{t.slugFrozen}</p>}
      {importTaxonomy
      ? <label className="admin-field admin-tag-field">{t.tags}<input name="tag_names" defaultValue={draft?.tags.join(", ") ?? ""} maxLength={2000} /></label>
      : <fieldset className="admin-tag-field" disabled={disabled}><legend>{t.tags}</legend><div className="admin-tag-options">
        {taxonomy.tags.map((tag) => <label key={tag.id}><input type="checkbox" name="tag_ids" value={tag.id}
          defaultChecked={prompt?.tagIds.includes(tag.id)} />{tag.name}</label>)}
      </div></fieldset>}
    </section>
    <section className="admin-editor-panel" aria-labelledby="admin-source-title">
      <div className="admin-editor-panel-head"><h2 id="admin-source-title">{t.sourceContent} · {source || t.chooseLanguage}</h2><span>{t.original}</span></div>
      <div className="admin-editor-stack">
        <label className="admin-field">{t.title}<input name="title" defaultValue={prompt?.title ?? draft?.title} required maxLength={200} disabled={disabled} /></label>
        <label className="admin-field">{t.description}<textarea name="description" defaultValue={prompt?.description ?? ""} rows={3} maxLength={2000} disabled={disabled} /></label>
        <label className="admin-field">{t.template}<textarea name="prompt_template" defaultValue={prompt?.prompt_template ?? draft?.promptTemplate} rows={10} required maxLength={50000} disabled={disabled} dir="auto" /></label>
        <label className="admin-field">{t.imageAlt}<input name="image_alt" defaultValue={prompt?.image_alt ?? draft?.imageAlt} required maxLength={500} disabled={disabled} /></label>
      </div>
    </section>
    <section className="admin-editor-panel" aria-labelledby="admin-translation-title">
      <div className="admin-editor-panel-head"><h2 id="admin-translation-title">{t.translation} · {target || t.chooseLanguage}</h2><span>{t.translationHint}</span></div>
      <input type="hidden" name="translation_locale" value={target} />
      <div className="admin-editor-stack">
        <label className="admin-field">{t.translationMode}<Select name="translation_mode" defaultValue={translated ? "present" : "remove"} disabled={disabled}
          ariaLabel={t.translationMode} options={[{ value: "present", label: t.present },
            { value: "remove", label: t.remove }]} /></label>
        <label className="admin-field">{t.title}<input name="translation_title" defaultValue={translated?.title ?? ""} maxLength={200} disabled={disabled} /></label>
        <label className="admin-field">{t.description}<textarea name="translation_description" defaultValue={translated?.description ?? ""} rows={3} maxLength={2000} disabled={disabled} /></label>
        <label className="admin-field">{t.template}<textarea name="translation_prompt_template" defaultValue={translated?.prompt_template ?? ""} rows={8} maxLength={50000} disabled={disabled} dir="auto" /></label>
        <label className="admin-field">{t.imageAlt}<input name="translation_image_alt" defaultValue={translated?.image_alt ?? ""} maxLength={500} disabled={disabled} /></label>
      </div>
    </section>
    <section className="admin-editor-panel" aria-labelledby="admin-variables-title">
      <div className="admin-editor-panel-head"><h2 id="admin-variables-title">{t.variables}</h2><span>{t.variableFormat}</span></div>
      <p className="admin-field-note">{t.variablesHelp}</p>
      <label className="admin-field">{t.variables}<textarea className="admin-json-input" name="variables_json"
        defaultValue={JSON.stringify(prompt?.variables ?? draft?.variables ?? [], null, 2)} rows={14} spellCheck={false} disabled={disabled} /></label>
    </section>
  </>;
}

export function AdminPromptChecks({ prompt, locale }: { prompt: AdminPrompt; locale: Locale }) {
  const t = adminPromptCopy(locale);
  const sourceKeys = new Set(scanPromptKeys(prompt.prompt_template));
  const variableKeys = new Set(prompt.variables.map((item) => item.key));
  const variablesValid = sourceKeys.size === variableKeys.size && [...sourceKeys].every((key) => variableKeys.has(key));
  const translationKeys = prompt.translation ? new Set(scanPromptKeys(prompt.translation.prompt_template)) : null;
  const translationValid = translationKeys === null || (translationKeys.size === sourceKeys.size && [...sourceKeys].every((key) => translationKeys.has(key)));
  const checks = [
    [t.checkSource, !!(prompt.title.trim() && prompt.prompt_template.trim() && prompt.image_alt.trim())],
    [t.checkVariables, variablesValid],
    [t.checkTranslation, translationValid],
    [t.checkImage, !!(prompt.original_image_key && prompt.preview_image_key && prompt.original_width > 0 && prompt.original_height > 0 && prompt.preview_width > 0 && prompt.preview_height > 0 && prompt.original_size_bytes > 0 && prompt.preview_size_bytes > 0)],
  ] as const;
  return <section className="admin-side-panel" aria-labelledby="admin-checks-title">
    <h2 id="admin-checks-title">{t.contentChecks}</h2>
    <ul className="admin-check-list">{checks.map(([label, valid]) =>
      <li key={label}><span aria-hidden="true">{valid ? "✓" : "!"}</span>{label}<strong>{valid ? t.checkPassed : t.checkNeedsAttention}</strong></li>)}</ul>
    <p className="admin-field-note">{t.checkSavedOnly}</p>
  </section>;
}
