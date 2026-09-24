import type { Locale } from "../lib/localization";
import { exploreScope, localeHref, readExploreFilters, type ExploreFilters } from "../lib/explore";
import { uiCopy } from "../lib/ui-copy";

function Logo() {
  return (
    <svg viewBox="0 0 32 36" width="32" height="36" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="28" height="28" rx="7" fill="#18181B" />
      <path d="M10 12H19C21.2091 12 23 13.7909 23 16C23 18.2091 21.2091 20 19 20H14V25H10V12Z" fill="white" />
      <path d="M14 15.5V17H18.5C18.9142 17 19.25 16.6642 19.25 16.25V15.75C19.25 15.3358 18.9142 15 18.5 15H14V15.5Z" fill="#2563EB" />
      <rect x="20" y="7" width="7" height="7" rx="2" fill="#2563EB" />
    </svg>
  );
}

function SearchForm({ filters, locale, url }: { filters: ExploreFilters; locale: Locale; url: URL }) {
  const t = uiCopy(locale);
  return (
    <form action={url.pathname === "/image" || exploreScope(url.pathname) ? url.pathname : "/"} method="get" role="search" className="site-search">
      <input type="hidden" name="ui_locale" value={locale} />
      {filters.category && exploreScope(url.pathname)?.kind !== "category" && <input type="hidden" name="category" value={filters.category} />}
      {filters.tag && exploreScope(url.pathname)?.kind !== "tag" && <input type="hidden" name="tag" value={filters.tag} />}
      {filters.model && <input type="hidden" name="model" value={filters.model} />}
      {filters.ratio && <input type="hidden" name="ratio" value={filters.ratio} />}
      {filters.sourceLanguage && <input type="hidden" name="source_language" value={filters.sourceLanguage} />}
      {filters.sort !== "latest" && <input type="hidden" name="sort" value={filters.sort} />}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.6" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input name="q" type="search" defaultValue={filters.q} placeholder={t.search} aria-label={t.search} />
    </form>
  );
}

export function SiteHeader({ locale, filters, url }: {
  locale: Locale;
  filters?: ExploreFilters;
  url: URL;
}) {
  const t = uiCopy(locale);
  const searchFilters = filters ?? readExploreFilters(new URLSearchParams());
  return (
    <>
      <header className="site-header" lang={locale}>
        <div className="site-header-inner">
          <a className="site-brand" href="/" aria-label="PromptVault">
            <Logo />
            <span>Prompt<span className="brand-blue">Vault</span></span>
          </a>
          <nav aria-label={t.navigation} className="site-nav">
            <a href="/" aria-current={url.pathname === "/" || url.pathname === "/image" ? "page" : undefined}>{t.explore}</a>
          </nav>
          <div className="desktop-search"><SearchForm filters={searchFilters} locale={locale} url={url} /></div>
          <nav className="locale-switch" aria-label={t.language}>
            <a href={localeHref(url, "zh-CN")} lang="zh-CN" aria-current={locale === "zh-CN" ? "true" : undefined}>中文</a>
            <span aria-hidden="true">/</span>
            <a href={localeHref(url, "en-US")} lang="en-US" aria-current={locale === "en-US" ? "true" : undefined}>EN</a>
          </nav>
        </div>
      </header>
      <div className="mobile-search" lang={locale}><SearchForm filters={searchFilters} locale={locale} url={url} /></div>
    </>
  );
}
