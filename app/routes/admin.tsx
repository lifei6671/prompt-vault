import { env } from "cloudflare:workers";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import type { Route } from "./+types/admin";
import { adminTaxonomyCopy, uiCopy } from "../lib/ui-copy";
import { adminPromptCopy } from "../lib/admin-prompt-copy";
import { adminListCopy } from "../lib/admin-list-copy";
import { localeHref } from "../lib/explore";
import { getAdminNavCounts } from "../services/admin-list.server";
import { guardAdminRequest, loadAdmin } from "../services/admin-route.server";
import "../admin.css";

export const meta: Route.MetaFunction = () => [
  { title: "Admin · PromptVault" },
  { name: "robots", content: "noindex,nofollow" },
];

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });

export const middleware: Route.MiddlewareFunction[] = [
  ({ request }, next) => guardAdminRequest(request, env, next),
];

export async function loader({ request }: Route.LoaderArgs) {
  const authorized = await loadAdmin(request, env);
  const counts = await getAdminNavCounts(env.DB);
  return { locale: authorized.data.locale, counts };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => { setDrawerOpen(false); menuRef.current?.focus(); };
  useEffect(() => { if (drawerOpen) closeRef.current?.focus(); }, [drawerOpen]);
  const location = useLocation();
  const locale = loaderData.locale;
  const t = uiCopy(locale);
  const admin = adminTaxonomyCopy(locale);
  const prompt = adminPromptCopy(locale);
  const list = adminListCopy(locale);
  const count = new Intl.NumberFormat(locale);
  const pathname = location.pathname;
  const url = new URL(location.pathname + location.search, "https://vault.disign.me");
  const links = [
    { href: "/admin/prompts", label: prompt.prompts, count: loaderData.counts.prompts,
      current: pathname.startsWith("/admin/prompts") },
    { href: "/admin/categories", label: admin.categories, count: loaderData.counts.categories,
      current: pathname.startsWith("/admin/categories") },
    { href: "/admin/tags", label: admin.tags, count: loaderData.counts.tags,
      current: pathname.startsWith("/admin/tags") },
  ];
  const navigation = (mobile: boolean) => <nav aria-label={admin.navigation} className="admin-nav">
    <span className="admin-nav-caption">{list.content}</span>
    {links.map((item) => <a key={item.href} href={item.href}
      aria-current={item.current ? "page" : undefined}
      onClick={mobile ? closeDrawer : undefined}>
      <span>{item.label}</span><span className="admin-nav-count">{count.format(item.count)}</span>
    </a>)}
  </nav>;
  const languages = <div className="admin-languages" aria-label={t.language}>
    <span>{t.language}</span>
    <a href={localeHref(url, "zh-CN")} aria-current={locale === "zh-CN" ? "true" : undefined}>中文</a>
    <span aria-hidden="true">/</span>
    <a href={localeHref(url, "en-US")} aria-current={locale === "en-US" ? "true" : undefined}>EN</a>
  </div>;
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <a className="admin-brand" href="/admin/prompts"><span className="admin-brand-mark">P</span>PromptVault <small>ADMIN</small></a>
      {navigation(false)}
      <div className="admin-sidebar-footer">
        <a href="/">{t.backToExplore}</a>
        {languages}
      </div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header">
        <button ref={menuRef} type="button" className="admin-menu-button" aria-label={list.menu}
          aria-expanded={drawerOpen} aria-controls="admin-mobile-drawer"
          onClick={() => setDrawerOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <a href="/admin/prompts" className="admin-header-title">PromptVault Admin</a>
        <div className="admin-header-language">{languages}</div>
      </header>
      <div className="admin-drawer-layer" hidden={!drawerOpen} onKeyDown={(event) => {
        if (event.key === "Escape") closeDrawer();
      }}>
        <button type="button" className="admin-drawer-backdrop" aria-label={list.closeMenu}
          onClick={closeDrawer} />
        <div className="admin-drawer" id="admin-mobile-drawer">
          <div className="admin-drawer-heading"><strong>PromptVault Admin</strong>
            <button ref={closeRef} type="button" aria-label={list.closeMenu} onClick={closeDrawer}>×</button></div>
          {navigation(true)}
          <div className="admin-sidebar-footer"><a href="/">{t.backToExplore}</a></div>
        </div>
      </div>
      <main className="admin-main"><Outlet context={locale} /></main>
    </div>
  </div>;
}
