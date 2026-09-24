import { useState } from "react";
import type { Locale } from "~/lib/localization";
import { exploreContentType, exploreHref, explorePath, exploreScope, type ExploreFilters } from "~/lib/explore";
import { uiCopy } from "~/lib/ui-copy";
import { FilterDropdown, type FilterOption } from "./filter-dropdown";

type Option = { slug: string; name: string };
type FilterKey = "model" | "category" | "ratio" | "sourceLanguage" | "tag" | "q";
const queryKey: Record<FilterKey, string> = {
  model: "model", category: "category", ratio: "ratio",
  sourceLanguage: "source_language", tag: "tag", q: "q",
};

export function ExploreFiltersBar({ locale, filters, categories, tags, models, ratios, total, url }: {
  locale: Locale;
  filters: ExploreFilters;
  categories: Option[];
  tags: Option[];
  models: string[];
  ratios: string[];
  total: number;
  url: URL;
}) {
  const t = uiCopy(locale);
  const [open, setOpen] = useState<string | null>(null);
  const dropdowns: { name: string; label: string; value: string; options: FilterOption[] }[] = [
    { name: "model", label: t.model, value: filters.model,
      options: [{ value: "", label: t.allModels }, ...models.map((model) => ({ value: model, label: model }))] },
    { name: "category", label: t.categoryStyle, value: filters.category,
      options: [{ value: "", label: t.allCategories }, ...categories.map((item) => ({ value: item.slug, label: item.name }))] },
    { name: "ratio", label: t.ratio, value: filters.ratio,
      options: [{ value: "", label: t.allRatios }, ...ratios.map((ratio) => ({ value: ratio, label: ratio }))] },
    { name: "source_language", label: t.sourceLanguage, value: filters.sourceLanguage,
      options: [{ value: "", label: t.allPrompts }, { value: "zh-CN", label: "简体中文" },
        { value: "en-US", label: "English" }] },
    { name: "tag", label: t.tags, value: filters.tag,
      options: [{ value: "", label: t.allTags }, ...tags.map((item) => ({ value: item.slug, label: item.name }))] },
  ];
  const active: { key: FilterKey; value: string; label: string }[] = [
    { key: "model", value: filters.model, label: t.model },
    { key: "category", value: categories.find((item) => item.slug === filters.category)?.name ?? filters.category, label: t.categoryStyle },
    { key: "ratio", value: filters.ratio, label: t.ratio },
    { key: "sourceLanguage", value: filters.sourceLanguage === "zh-CN" ? "简体中文" : filters.sourceLanguage === "en-US" ? "English" : filters.sourceLanguage, label: t.sourceLanguage },
    { key: "tag", value: tags.find((item) => item.slug === filters.tag)?.name ?? filters.tag, label: t.tags },
    { key: "q", value: filters.q, label: t.searchButton },
  ];
  const selected = active.filter((item) => !!filters[item.key]);

  return (
    <section id="explore-filters" className="filter-section" aria-label={t.filters}>
      {!exploreScope(url.pathname) && <h1 className="sr-only">{t.explore}</h1>}
      <div className="explore-controls">
        <div className="explore-control-top">
          <div className="content-types" role="group" aria-label={t.contentType}>
            <a href={exploreHref(url, "content_type", "")} aria-current={filters.contentType === "all" ? "true" : undefined}>
              {t.allPrompts} <small>{total.toLocaleString(locale)}</small>
            </a>
            <a href={exploreHref(url, "content_type", "image")} aria-current={filters.contentType === "image" ? "true" : undefined}>
              {t.images} <small>{total.toLocaleString(locale)}</small>
            </a>
            <button className="content-type-disabled" type="button" disabled aria-disabled="true">{t.videos} <small>0</small></button>
            <button className="content-type-disabled" type="button" disabled aria-disabled="true">{t.textPrompts} <small>0</small></button>
          </div>
          <div className="explore-view-controls">
            <div className="sort-options" role="group" aria-label={t.sort}>
              <a href={exploreHref(url, "sort", "recommended")} aria-current={filters.sort === "recommended" ? "true" : undefined}>{t.recommended}</a>
              <a href={exploreHref(url, "sort", "popular")} aria-current={filters.sort === "popular" ? "true" : undefined}>{t.popular}</a>
              <a href={exploreHref(url, "sort", "")} aria-current={filters.sort === "latest" ? "true" : undefined}>{t.newest}</a>
            </div>
            <a className="filter-submit" href="#explore-filter-rack">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              {t.filterView}
            </a>
          </div>
        </div>
        <div id="explore-filter-rack" className="filter-rack">
          {dropdowns.map((item) => <FilterDropdown key={item.name} {...item} url={url} open={open === item.name}
            onToggle={() => setOpen(open === item.name ? null : item.name)} onClose={() => setOpen(null)} />)}
          {selected.length > 0 && <div className="active-filters">
            {selected.map((item) => <a key={item.key} className="active-filter"
              href={exploreHref(url, queryKey[item.key], "")}
              aria-label={t.clear + ": " + item.label + " " + item.value}>
              {item.value}<span aria-hidden="true">×</span>
            </a>)}
            <a className="clear-filters" href={explorePath(exploreContentType(url.pathname)) + "?ui_locale=" + locale}>{t.clear}</a>
          </div>}
        </div>
      </div>
    </section>
  );
}
