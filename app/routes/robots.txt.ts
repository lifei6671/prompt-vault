export function loader() {
  return new Response(`User-agent: *
Allow: /
Disallow: /admin/
Sitemap: https://vault.disign.me/sitemap.xml
`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
