import type { Locale } from "../lib/localization";
import { pageHref } from "../lib/explore";
import { uiCopy } from "../lib/ui-copy";

export function Pagination({ url, page, totalPages, locale }: {
  url: URL; page: number; totalPages: number; locale: Locale;
}) {
  if (totalPages <= 1) return null;
  const t = uiCopy(locale);
  const label = t.page.replace("{page}", String(page)).replace("{total}", String(totalPages));
  return (
    <nav className="pagination" aria-label={label}>
      {page > 1 ? <a rel="prev" href={pageHref(url, page - 1)}>{t.previous}</a> : <span />}
      <span>{label}</span>
      {page < totalPages ? <a rel="next" href={pageHref(url, page + 1)}>{t.next}</a> : <span />}
    </nav>
  );
}
