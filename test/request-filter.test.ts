import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFilteredRequest } from "../workers/request-filter";
import { observeRequest } from "../workers/request-log";
import { PUBLIC_HTML_CACHE } from "../workers/response-policy";

const request = (path: string, init?: RequestInit) => new Request(`https://vault.disign.me${path}`, init);

afterEach(() => vi.restoreAllMocks());

describe("Worker scanning path filter", () => {
  it("returns a plain no-store 404 before SSR for known scanning paths", async () => {
    const ssr = vi.fn(async () => { throw new Error("SSR must not run"); });
    for (const path of [
      "/.ansible/vault_pass.txt", "/.env", "/.env.production", "/.git/config", "/.gitignore",
      "/.svn/entries", "/.aws/credentials", "/.AWS_/config", "/.ssh/id_rsa", "/.vscode/settings.json",
      "/wp", "/wp/test", "/wp-admin/", "/wp-content/plugins/test", "/wp-includes/test",
      "/wp-config.php.bak", "/wp-login.php/extra", "/wordpress/wp-includes/wlwmanifest.xml",
      "/application.yml", "/@fs/etc/passwd", "/config/.env", "/probe.php", "/shell.jsp", "/login.aspx",
    ]) {
      const response = await handleFilteredRequest(request(path), ssr);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("Cache-Control"), path).toBe("no-store");
      expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(await response.text()).toBe("Not Found");
    }
    expect(ssr).not.toHaveBeenCalled();
  });

  it("handles case, single percent encoding and malformed encoding without throwing", async () => {
    const ssr = vi.fn(async () => { throw new Error("SSR must not run"); });
    for (const path of ["/.ANSIBLE/vault_pass.txt", "/.GiT/HEAD", "/probe.PHP", "/shell.JsP",
      "/%2Eansible/vault_pass.txt", "/.%67it/config", "/.git%2Fconfig", "/probe%2Ephp",
      "/%40fs/etc/passwd", "/.ansible/%ZZ"]) {
      expect((await handleFilteredRequest(request(path), ssr)).status, path).toBe(404);
    }
    expect(ssr).not.toHaveBeenCalled();
  });

  it("rejects scanning methods without reading request bodies and returns no body for HEAD", async () => {
    const ssr = vi.fn(async () => { throw new Error("SSR must not run"); });
    for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"]) {
      const input = request("/.ansible/vault_pass.txt", {
        method, ...(["POST", "PUT"].includes(method) ? { body: "private request body" } : {}),
      });
      const response = await handleFilteredRequest(input, ssr);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(method === "HEAD" ? "" : "Not Found");
      expect(input.bodyUsed).toBe(false);
    }
    expect(ssr).not.toHaveBeenCalled();
  });

  it("preserves public, admin, resource and ordinary unknown routes and ignores query values", async () => {
    const ssr = vi.fn(async () => new Response("rendered", { headers: { "Content-Type": "text/html" } }));
    for (const path of ["/", "/image", "/category/art", "/tag/env", "/prompt/env",
      "/image/category/art", "/image/tag/cinematic", "/prompt/php-guide", "/admin", "/admin/prompts",
      "/admin/prompts/new", "/admin/prompts/new/image/original", "/admin/prompts/1/edit",
      "/admin/prompts/1/image", "/admin/prompts/1/preview", "/admin/categories", "/admin/tags",
      "/assets/app.js", "/assets/app.css", "/assets/php.png", "/favicon.ico", "/robots.txt", "/sitemap.xml",
      "/.well-known/acme-challenge/token", "/unknown-path", "/bad%ZZ",
      "/?q=/.ansible/vault_pass.txt", "/image?q=/.git/config&ui_locale=en-US",
      "/prompt/public?redirect=/wp-admin/&example=probe.php", "/?q=/..", "/?q=/.env"]) {
      const input = request(path);
      const calls = ssr.mock.calls.length;
      const response = await handleFilteredRequest(input, ssr);
      expect(ssr.mock.calls.length, path).toBe(calls + 1);
      expect(ssr).toHaveBeenLastCalledWith(input);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("rendered");
    }
    expect((await handleFilteredRequest(request("/image"), ssr)).headers.get("Cache-Control"))
      .toBe(PUBLIC_HTML_CACHE);
    expect((await handleFilteredRequest(request("/admin"), ssr)).headers.get("Cache-Control"))
      .toBe("no-store");
  });

  it("preserves SSR error responses and exceptions outside scanning paths", async () => {
    const response = await handleFilteredRequest(request("/missing"), async () =>
      new Response("custom not found page", { status: 404, headers: { "Content-Type": "text/html" } }));
    expect(await response.text()).toBe("custom not found page");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const failure = new Error("real SSR failure");
    await expect(handleFilteredRequest(request("/image"), async () => { throw failure; })).rejects.toBe(failure);
  });

  it("retains one sanitized request summary with zero D1 work and no error stack", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prepare = vi.spyOn(env.DB, "prepare");
    const batch = vi.spyOn(env.DB, "batch");
    const ssr = vi.fn(async () => { throw new Error("SSR must not run"); });
    const response = await observeRequest(request("/.ansible/private-file.txt?q=private-search", {
      method: "POST", body: "private prompt", headers: { Cookie: "private-cookie", Authorization: "Bearer private-token" },
    }), env.DB, (input) => handleFilteredRequest(input, ssr));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(ssr).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ pathname: "/other", status: 404, admin: false,
      d1Queries: 0, d1RowsRead: 0, d1Errors: 0, exploreOptionsCacheHits: 0, exploreOptionsCacheMisses: 0 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/ansible|private|stack|vault_pass/);
  });
});
