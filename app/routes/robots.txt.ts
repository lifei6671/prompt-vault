export function loader() {
  return new Response(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /*?*q=
Disallow: /*?*model=
Disallow: /*?*ratio=
Disallow: /*?*source_language=
Disallow: /*?*category=
Disallow: /*?*tag=
Disallow: /*?*sort=
Disallow: /*?*content_type=
Sitemap: https://vault.disign.me/sitemap.xml
`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
