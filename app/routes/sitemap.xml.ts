import { env } from "cloudflare:workers";
import { buildSitemap } from "../services/seo.server";

export async function loader() {
  return new Response(await buildSitemap(env.DB), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
