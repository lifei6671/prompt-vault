import { applyResponseCachePolicy } from "./response-policy";

const scanPrefixes = [
  "/.ansible", "/.env", "/.git", "/.svn", "/.aws", "/.ssh", "/.vscode",
  "/wp/", "/wp-admin", "/wp-content", "/wp-includes", "/wp-config.php", "/wp-login.php",
  "/application.", "/@fs/",
];

function isScanPath(pathname: string): boolean {
  let path = pathname;
  try { path = decodeURIComponent(path); } catch { /* Match the original path if encoding is malformed. */ }
  path = path.toLowerCase();
  return scanPrefixes.some((prefix) => path.startsWith(prefix))
    || path === "/wp"
    || path.endsWith("/.env")
    || path.endsWith("/wlwmanifest.xml")
    || [".php", ".jsp", ".aspx"].some((extension) => path.endsWith(extension));
}

export async function handleFilteredRequest(request: Request,
  handler: (request: Request) => Promise<Response>): Promise<Response> {
  const response = isScanPath(new URL(request.url).pathname)
    ? new Response(request.method === "HEAD" ? null : "Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
    : await handler(request);
  return applyResponseCachePolicy(request, response);
}
