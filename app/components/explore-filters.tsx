import type { Locale } from "~/lib/localization";
import type { ExploreFilters } from "~/lib/explore";
import { uiCopy } from "~/lib/ui-copy";

type CategoryOption = { slug: string; name: string };

export function ExploreFiltersBar({ locale, filters, categories, models, ratios }: {
  locale: Locale;
  filters: ExploreFilters;
  categories: CategoryOption[];
  models: string[];
  ratios: string[];
}) {
  const t = uiCopy(locale);
  return (
    <section className="filter-section" aria-label={t.filters}>
      <div className="filter-heading">
        <h1>{t.explore}</h1>
        <span className="sort-label">{t.newest}</span>
      </div>
      <form action="/" method="get" className="filter-form">
        <input type="hidden" name="ui_locale" value={locale} />
        {filters.q && <input type="hidden" name="q" value={filters.q} />}
        <div className="filter-fields">
          <label>
            <span>{t.category}</span>
            <select name="category" defaultValue={filters.category}>
              <option value="">{t.allCategories}</option>
              {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
            </select>
          </label>
          <label>
            <span>{t.model}</span>
            <select name="model" defaultValue={filters.model}>
              <option value="">{t.allModels}</option>
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          <label>
            <span>{t.ratio}</span>
            <select name="ratio" defaultValue={filters.ratio}>
              <option value="">{t.allRatios}</option>
              {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </label>
          <label>
            <span>{t.sourceLanguage}</span>
            <select name="source_language" defaultValue={filters.sourceLanguage}>
              <option value="">{t.allLanguages}</option>
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
        </div>
        <div className="filter-actions">
          <button type="submit">{t.apply}</button>
          <a href={`/?ui_locale=${locale}`}>{t.clear}</a>
        </div>
      </form>
    </section>
  );
}

