import { useState } from "react";
import { Form, useOutletContext } from "react-router";
import type { Locale } from "../lib/localization";
import { adminTaxonomyCopy } from "../lib/ui-copy";
import type { TaxonomyKind, TaxonomyRow } from "../services/taxonomy-admin.server";

type ErrorCode = "invalid" | "missing" | "duplicate" | "referenced" | "failed";
type Props = { kind: TaxonomyKind; items: TaxonomyRow[]; error?: ErrorCode };

const inputClass = "w-full min-w-0 rounded-md border border-border bg-white px-3 py-2 text-sm";
const labelClass = "grid min-w-0 gap-1 text-sm font-medium";
const cardClass = "rounded-md border border-border bg-white p-4";
const gridClass = "grid gap-3 sm:grid-cols-2";

function otherLocale(locale: Locale): Locale {
  return locale === "zh-CN" ? "en-US" : "zh-CN";
}

export default function TaxonomyAdminPage({ kind, items, error }: Props) {
  const locale = useOutletContext<Locale>();
  const t = adminTaxonomyCopy(locale);
  const title = kind === "category" ? t.categories : t.tags;
  const [source, setSource] = useState<Locale | "">("");
  const target = source ? otherLocale(source) : "";
  return (
    <section aria-labelledby="taxonomy-admin-title" className="space-y-8">
      <h1 id="taxonomy-admin-title" className="text-3xl font-semibold">{title}</h1>
      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{t[error]}</p>}
      <section aria-labelledby="taxonomy-create-title" className={cardClass}>
        <h2 id="taxonomy-create-title" className="mb-4 text-lg font-semibold">{t.create} {title}</h2>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="_intent" value="create" />
          <div className={gridClass}>
            <label className={labelClass}>{t.slug}<input className={inputClass} name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
            <label className={labelClass}>{t.sourceLanguage}
              <select className={inputClass} name="source_language" required value={source}
                onChange={(event) => setSource(event.target.value as Locale)}>
                <option value="">{t.chooseLanguage}</option>
                <option value="zh-CN">zh-CN</option><option value="en-US">en-US</option>
              </select>
            </label>
            <label className={labelClass}>{t.original} · {t.name} ({source || t.chooseLanguage})
              <input className={inputClass} name="name" required maxLength={120} />
            </label>
            {kind === "category" && <>
              <label className={labelClass}>{t.original} · {t.description} ({source || t.chooseLanguage})
                <textarea className={inputClass} name="description" maxLength={1000} rows={2} />
              </label>
              <label className={labelClass}>{t.sortOrder}
                <input className={inputClass} name="sort_order" type="number" min={-1000000} max={1000000} defaultValue={0} required />
              </label>
            </>}
            <p className="text-sm font-medium">{t.translationLanguage}: {target || t.chooseLanguage}</p>
            <label className={labelClass}>{t.translationName} ({target || t.chooseLanguage})
              <input className={inputClass} name="translation_name" maxLength={120} />
            </label>
            {kind === "category" && <label className={labelClass}>{t.translationDescription} ({target || t.chooseLanguage})
              <textarea className={inputClass} name="translation_description" maxLength={1000} rows={2} />
            </label>}
          </div>
          <p className="text-sm text-muted-foreground">{t.optional}</p>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">{t.create}</button>
        </Form>
      </section>
      <section aria-label={title} className="space-y-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{t.empty}</p>}
        {items.map((item) => {
          const target = otherLocale(item.source_language);
          return <article key={item.id} className={cardClass}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{item.name} <span className="font-normal text-muted-foreground">/{item.slug}</span></h2>
              <span className="text-xs text-muted-foreground">{t.original}: {item.source_language} · {t.translation}: {target}</span>
            </div>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="_intent" value="update" />
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="translation_locale" value={target} />
              <div className={gridClass}>
                <label className={labelClass}>{t.name} ({item.source_language})
                  <input className={inputClass} name="name" defaultValue={item.name} required maxLength={120} />
                </label>
                {kind === "category" && <>
                  <label className={labelClass}>{t.description} ({item.source_language})
                    <textarea className={inputClass} name="description" defaultValue={item.description ?? ""} maxLength={1000} rows={2} />
                  </label>
                  <label className={labelClass}>{t.sortOrder}
                    <input className={inputClass} name="sort_order" type="number" min={-1000000} max={1000000} defaultValue={item.sort_order} required />
                  </label>
                </>}
                <label className={labelClass}>{t.translationName} ({target})
                  <input className={inputClass} name="translation_name" defaultValue={item.translation_name ?? ""} maxLength={120} />
                </label>
                {kind === "category" && <label className={labelClass}>{t.translationDescription} ({target})
                  <textarea className={inputClass} name="translation_description" defaultValue={item.translation_description ?? ""} maxLength={1000} rows={2} />
                </label>}
              </div>
              <p className="text-sm text-muted-foreground">{t.optional}</p>
              <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">{t.save}</button>
            </Form>
            <Form method="post" className="mt-3">
              <input type="hidden" name="_intent" value="delete" />
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="rounded-md border border-border px-4 py-2 text-sm font-medium">{t.delete} {item.name}</button>
            </Form>
          </article>;
        })}
      </section>
    </section>
  );
}



