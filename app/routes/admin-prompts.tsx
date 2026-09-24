import { env } from "cloudflare:workers";
import { data, useOutletContext } from "react-router";
import type { Route } from "./+types/admin-prompts";
import type { Locale } from "../lib/localization";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { adminListCopy } from "../lib/admin-list-copy";
import { pageHref, previewImageUrl } from "../lib/explore";
import {
  ADMIN_PAGE_SIZE, getAdminListOptions, getAdminPromptSummary, queryAdminPrompts,
  readAdminListFilters, type AdminListItem,
} from "../services/admin-list.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export async function loader({ request }: Route.LoaderArgs) {
  const filters = readAdminListFilters(new URL(request.url).searchParams);
  const [summary, options] = await Promise.all([
    getAdminPromptSummary(env.DB), getAdminListOptions(env.DB),
  ]);
  if (!options.categories.some((item) => item.slug === filters.category)) filters.category = "";
  if (!options.models.includes(filters.model)) filters.model = "";
  if (!options.ratios.includes(filters.ratio)) filters.ratio = "";
  const result = await queryAdminPrompts(env.DB, filters);
  return data({ ...result, pageSize: ADMIN_PAGE_SIZE, filters, summary, options, imageBaseUrl: env.IMAGE_BASE_URL, pageUrl: request.url },
    { headers: { "Cache-Control": "no-store" } });
}

function statusOf(item: AdminListItem): "deleted" | "published" | "draft" {
  return item.deleted_at ? "deleted" : item.status;
}

export default function AdminPrompts({ loaderData }: Route.ComponentProps) {
  const locale = useOutletContext<Locale>();
  const t = adminPromptCopy(locale);
  const a = adminListCopy(locale);
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  const formatDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : date.format(parsed);
  };
  const { items, filters, options, summary, total, page, pages } = loaderData;
  const url = new URL(loaderData.pageUrl);
  const start = total === 0 ? 0 : (page - 1) * loaderData.pageSize + 1;
  const end = Math.min(page * loaderData.pageSize, total);
  const renderImage = (item: AdminListItem) => item.deleted_at
    ? <span className="admin-thumb admin-thumb-empty" aria-hidden="true" />
    : <img className="admin-thumb" src={previewImageUrl(loaderData.imageBaseUrl, item.preview_image_key)}
        width={item.preview_width} height={item.preview_height} alt="" loading="lazy" />;
  const renderStatus = (item: AdminListItem) => {
    const key = statusOf(item);
    return <span className={`admin-status admin-status-${key}`}>{t[key]}</span>;
  };
  const editLink = (item: AdminListItem) => <a href={`/admin/prompts/${item.id}/edit`}>
    {item.deleted_at ? a.view : t.edit}</a>;
  return <section className="admin-list-page" aria-labelledby="admin-list-title">
    <div className="admin-page-heading">
      <div><h1 id="admin-list-title">{t.prompts}</h1><p>{a.description}</p></div>
      <a className="admin-primary-action" href="/admin/prompts/new">+ {t.create}</a>
    </div>
    <div className="admin-summary" aria-label={a.total}>
      {([
        [a.total, summary.total, "total"], [t.draft, summary.draft, "draft"],
        [t.published, summary.published, "published"], [t.deleted, summary.deleted, "deleted"],
      ] as const).map(([label, value, key]) =>
        <div className={`admin-summary-item admin-summary-${key}`} key={key}>
          <span>{label}</span><strong>{number.format(value)}</strong>
        </div>)}
    </div>
    <form className="admin-filters" method="get" action="/admin/prompts">
      <label className="admin-search"><span className="admin-visually-hidden">{a.searchLabel}</span>
        <input name="q" type="search" maxLength={100} defaultValue={filters.q} placeholder={a.search} />
      </label>
      <label><span className="admin-visually-hidden">{t.status}</span><select name="status" defaultValue={filters.status}>
        <option value="">{t.status}: {a.all}</option>
        <option value="draft">{t.draft}</option><option value="published">{t.published}</option>
        <option value="deleted">{t.deleted}</option>
      </select></label>
      <label><span className="admin-visually-hidden">{t.category}</span><select name="category" defaultValue={filters.category}>
        <option value="">{t.category}: {a.all}</option>
        {options.categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
      </select></label>
      <label><span className="admin-visually-hidden">{t.model}</span><select name="model" defaultValue={filters.model}>
        <option value="">{t.model}: {a.all}</option>
        {options.models.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label><span className="admin-visually-hidden">{t.ratio}</span><select name="ratio" defaultValue={filters.ratio}>
        <option value="">{t.ratio}: {a.all}</option>
        {options.ratios.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <button type="submit">{a.apply}</button>
      <a href="/admin/prompts">{a.reset}</a>
    </form>
    {items.length === 0 ? <div className="admin-empty">
      <p>{total === 0 && !filters.q && filters.status === "all" && !filters.category && !filters.model && !filters.ratio
        ? t.empty : a.noResults}</p>
      <a className="admin-primary-action" href="/admin/prompts/new">{t.create}</a>
    </div> : <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">{t.title}</th><th scope="col">{t.slug}</th>
            <th scope="col">{t.category}</th><th scope="col">{t.model}</th>
            <th scope="col">{t.ratio}</th><th scope="col">{t.status}</th>
            <th scope="col">{t.updatedAt}</th><th scope="col">{a.actions}</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td><div className="admin-table-prompt">{renderImage(item)}<div>
              <strong>{item.title}</strong><p>{item.description || "—"}</p></div></div></td>
            <td className="admin-slug">{item.slug}</td>
            <td>{item.category_name}</td><td>{item.model || "—"}</td><td>{item.ratio || "—"}</td>
            <td>{renderStatus(item)}</td><td>{formatDate(item.updated_at)}</td>
            <td><div className="admin-row-actions">{editLink(item)}
              {!item.deleted_at && <a href={`/admin/prompts/${item.id}/preview`}>{t.previewPrompt}</a>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="admin-compact-list" aria-label={a.list}>{items.map((item) =>
        <article className="admin-compact-row" key={item.id}>
          {renderImage(item)}
          <div className="admin-compact-content"><strong>{item.title}</strong>
            <span className="admin-slug">{item.slug}</span>
            <span>{item.category_name} · {item.model || "—"}</span></div>
          <div className="admin-compact-actions">{renderStatus(item)}{editLink(item)}</div>
        </article>)}</div>
    </>}
    <nav className="admin-pagination" aria-label={a.page.replace("{page}", number.format(page)).replace("{pages}", number.format(pages))}>
      <span>{a.showing.replace("{from}", number.format(start)).replace("{to}", number.format(end))
        .replace("{total}", number.format(total))}</span>
      <div>{page > 1 && <a href={pageHref(url, page - 1)}>{a.previous}</a>}
        <span>{a.page.replace("{page}", number.format(page)).replace("{pages}", number.format(pages))}</span>
        {page < pages && <a href={pageHref(url, page + 1)}>{a.next}</a>}</div>
    </nav>
    <a className="admin-mobile-create admin-primary-action" href="/admin/prompts/new">+ {t.create}</a>
  </section>;
}
