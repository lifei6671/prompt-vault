import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    const response = await requestHandler(request);
    let path = new URL(request.url).pathname;
    try { path = decodeURIComponent(path); } catch { /* Keep the raw path for malformed escapes. */ }
    path = path.toLowerCase();
    if (path !== "/admin" && !path.startsWith("/admin/")) return response;
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
