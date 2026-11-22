import { isAdminPath } from "./response-policy";
import { env, withEnv } from "cloudflare:workers";
import { createRequestMetrics, observeDatabase, type RequestMetrics } from "./request-metrics";

function routePath(pathname: string) {
  const path = pathname.toLowerCase().replace(/\/$/, "") || "/";
  if (["/", "/image", "/robots.txt", "/sitemap.xml", "/admin", "/admin/categories",
    "/admin/tags", "/admin/prompts", "/admin/prompts/new"].includes(path)) return path;
  const taxonomy = /^\/(image\/)?(category|tag)\/[^/]+$/.exec(path);
  if (taxonomy) return `/${taxonomy[1] ?? ""}${taxonomy[2]}/:slug`;
  if (/^\/prompt\/[^/]+$/.test(path)) return "/prompt/:slug";
  const admin = /^\/admin\/prompts\/[^/]+\/(edit|image|preview)$/.exec(path);
  if (admin) return `/admin/prompts/:id/${admin[1]}`;
  if (/^\/admin\/prompts\/new\/image\/[^/]+$/.test(path)) return "/admin/prompts/new/image/:kind";
  return isAdminPath(pathname) ? "/admin/*" : "/other";
}

export function requestSummary(request: Request, status: number, durationMs: number,
  metrics: RequestMetrics = createRequestMetrics()) {
  const pathname = new URL(request.url).pathname;
  const ray = request.headers.get("cf-ray") ?? "";
  return {
    requestId: /^[a-f0-9]{16}-[A-Z]{3}$/i.test(ray) ? ray : crypto.randomUUID(),
    method: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(request.method) ? request.method : "OTHER",
    pathname: routePath(pathname),
    status,
    durationMs,
    admin: isAdminPath(pathname),
    ...metrics,
  };
}

export async function observeRequest(request: Request, database: D1Database,
  handler: (request: Request) => Promise<Response>): Promise<Response> {
  const observation = observeDatabase(database);
  const started = performance.now();
  let status = 500;
  return withEnv({ ...env, DB: observation.db }, async () => {
    try {
      const response = await handler(request);
      status = response.status;
      return response;
    } finally {
      await observation.finish();
      console.log(requestSummary(request, status, Math.round(performance.now() - started), observation.metrics));
    }
  }) as Promise<Response>;
}
