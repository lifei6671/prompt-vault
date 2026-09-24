import { Fragment, useState, type ReactNode } from "react";
import { Form, useOutletContext } from "react-router";
import type { Locale } from "../lib/localization";
import { adminTaxonomyCopy } from "../lib/ui-copy";
import type { TaxonomyKind, TaxonomyRow } from "../services/taxonomy-admin.server";

type ErrorCode = "invalid" | "missing" | "duplicate" | "referenced" | "failed";
type Props = { kind: TaxonomyKind; items: TaxonomyRow[]; error?: ErrorCode };
const otherLocale = (locale: Locale): Locale => locale === "zh-CN" ? "en-US" : "zh-CN";

export default function TaxonomyAdminPage({ kind, items, error }: Props) {
  const locale = useOutletContext<Locale>();
  const t = adminTaxonomyCopy(locale);
  const title = kind === "category" ? t.categories : t.tags;
  const [source, setSource] = useState<Locale | "">("");
  const [editing, setEditing] = useState<number | null>(null);
  const target = source ? otherLocale(source) : "";
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const formatDate = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : date.format(parsed); };
  const toggle = (id: number) => setEditing(editing === id ? null : id);
  const editForm = (item: TaxonomyRow, surface: "desktop" | "mobile") => {
    const translationLocale = otherLocale(item.source_language);
    return <div className="admin-taxonomy-edit-panel" id={`taxonomy-edit-${surface}-${item.id}`}>
      <Form method="post" className="admin-taxonomy-form">
        <input type="hidden" name="_intent" value="update" /><input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="translation_locale" value={translationLocale} />
        <div className="admin-taxonomy-fields">
          <label className="admin-field">{t.name} ({item.source_language})<input name="name" defaultValue={item.name} required maxLength={120} /></label>
          {kind === "category" && <>
            <label className="admin-field">{t.description} ({item.source_language})<textarea name="description" defaultValue={item.description ?? ""} maxLength={1000} rows={2} /></label>
            <label className="admin-field">{t.sortOrder}<input name="sort_order" type="number" min={-1000000} max={1000000} defaultValue={item.sort_order} required /></label>
          </>}
          <label className="admin-field">{t.translationName} ({translationLocale})<input name="translation_name" defaultValue={item.translation_name ?? ""} maxLength={120} /></label>
          {kind === "category" && <label className="admin-field">{t.translationDescription} ({translationLocale})<textarea name="translation_description" defaultValue={item.translation_description ?? ""} maxLength={1000} rows={2} /></label>}
        </div>
        <p className="admin-field-note">{t.optional}</p>
        <button className="admin-primary-action" type="submit">{t.save}</button>
      </Form>
      <Form method="post"><input type="hidden" name="_intent" value="delete" /><input type="hidden" name="id" value={item.id} />
        <button className="admin-danger-action" type="submit">{t.delete} {item.name}</button></Form>
    </div>;
  };
  return <section aria-labelledby="taxonomy-admin-title" className="admin-taxonomy-page">
    <header className="admin-page-heading"><div><h1 id="taxonomy-admin-title">{title}</h1><p>{t.manageDescription}</p></div></header>
    {error && <p role="alert" className="admin-form-error">{t[error]}</p>}
    <section aria-labelledby="taxonomy-create-title" className="admin-editor-panel admin-taxonomy-create">
      <div className="admin-editor-panel-head"><h2 id="taxonomy-create-title">{t.create} {title}</h2><span>{t.createHint}</span></div>
      <Form method="post" className="admin-taxonomy-form">
        <input type="hidden" name="_intent" value="create" />
        <div className="admin-taxonomy-fields">
          <label className="admin-field">{t.slug}<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label className="admin-field">{t.sourceLanguage}<select name="source_language" required value={source}
            onChange={(event) => setSource(event.target.value as Locale | "")}>
            <option value="">{t.chooseLanguage}</option><option value="zh-CN">zh-CN</option><option value="en-US">en-US</option>
          </select></label>
          <label className="admin-field">{t.original} · {t.name} ({source || t.chooseLanguage})<input name="name" required maxLength={120} /></label>
          {kind === "category" && <>
            <label className="admin-field">{t.original} · {t.description} ({source || t.chooseLanguage})<textarea name="description" maxLength={1000} rows={2} /></label>
            <label className="admin-field">{t.sortOrder}<input name="sort_order" type="number" min={-1000000} max={1000000} defaultValue={0} required /></label>
          </>}
          <label className="admin-field">{t.translationName} ({target || t.chooseLanguage})<input name="translation_name" maxLength={120} /></label>
          {kind === "category" && <label className="admin-field">{t.translationDescription} ({target || t.chooseLanguage})<textarea name="translation_description" maxLength={1000} rows={2} /></label>}
        </div>
        <p className="admin-field-note">{t.optional}</p><button className="admin-primary-action" type="submit">{t.create}</button>
      </Form>
    </section>
    {items.length === 0 ? <div className="admin-empty"><p>{t.empty}</p></div> : <>
      <div className="admin-table-wrap admin-taxonomy-table"><table className="admin-table"><thead><tr>
        <th scope="col">{t.name}</th><th scope="col">{t.slug}</th><th scope="col">{t.translation}</th><th scope="col">{t.sourceLanguage}</th>
        {kind === "category" && <th scope="col">{t.sortOrder}</th>}
        <th scope="col">{t.promptCount}</th><th scope="col">{t.updatedAt}</th><th scope="col">{t.edit}</th>
      </tr></thead><tbody>{items.map((item) => <FragmentRow key={item.id} item={item} kind={kind} t={t} number={number} formatDate={formatDate}
        expanded={editing === item.id} onToggle={() => toggle(item.id)} editForm={editForm(item, "desktop")} />)}</tbody></table></div>
      <div className="admin-compact-list admin-taxonomy-compact" aria-label={title}>{items.map((item) =>
        <article className="admin-compact-row" key={item.id}><div className="admin-compact-content"><strong>{item.name}</strong>
          <span className="admin-slug">/{item.slug}</span><span>{t.translation}: {item.translation_name || "—"}</span><span>{t.promptCount}: {number.format(item.prompt_count)} · {formatDate(item.updated_at)}</span>
          {editing === item.id && editForm(item, "mobile")}</div>
          <button className="admin-inline-button" type="button" aria-expanded={editing === item.id}
            aria-controls={`taxonomy-edit-mobile-${item.id}`} onClick={() => toggle(item.id)}>{editing === item.id ? t.close : t.edit}</button>
        </article>)}</div>
    </>}
  </section>;
}

function FragmentRow({ item, kind, t, number, formatDate, expanded, onToggle, editForm }: {
  item: TaxonomyRow; kind: TaxonomyKind; t: ReturnType<typeof adminTaxonomyCopy>; number: Intl.NumberFormat;
  formatDate: (value: string) => string; expanded: boolean; onToggle: () => void; editForm: ReactNode;
}) {
  return <Fragment><tr><td><strong className="admin-taxonomy-name">{item.name}</strong></td><td className="admin-slug">/{item.slug}</td><td>{item.translation_name || "—"}</td>
    <td>{item.source_language}</td>{kind === "category" && <td>{item.sort_order}</td>}
    <td>{number.format(item.prompt_count)}</td><td>{formatDate(item.updated_at)}</td>
    <td><button className="admin-inline-button" type="button" aria-expanded={expanded}
      aria-controls={`taxonomy-edit-desktop-${item.id}`} onClick={onToggle}>{expanded ? t.close : t.edit}</button></td></tr>
    {expanded && <tr className="admin-taxonomy-expanded"><td colSpan={kind === "category" ? 8 : 7}>{editForm}</td></tr>}
  </Fragment>;
}
