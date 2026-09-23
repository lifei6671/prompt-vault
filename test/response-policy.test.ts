import { describe, expect, it } from "vitest";
import { loader as rootLoader } from "../app/root";
import { applyResponseCachePolicy, PUBLIC_CRAWLER_CACHE, PUBLIC_HTML_CACHE } from "../workers/response-policy";
import { requestSummary } from "../workers/request-log";

const request = (path: string, init?: RequestInit) =>
  new Request(`https://vault.disign.me${path}`, init);
const html = (status = 200, headers: HeadersInit = {}) =>
  new Response("<html>content</html>", { status, headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
const policy = (path: string, init?: RequestInit, response = html()) =>
  applyResponseCachePolicy(request(path, init), response).headers.get("Cache-Control");

describe("final response cache policy", () => {
  it("caches only anonymous default public documents, including ordinary pagination", () => {
    for (const path of ["/", "/prompt/poster", "/category/art", "/tag/cinematic",
      "/?page=2", "/category/art?page=2", "/tag/cinematic?page=2"]) {
      expect(policy(path)).toBe(PUBLIC_HTML_CACHE);
    }
  });

  it("keeps locale variants, discovery filters and unknown queries private", () => {
    for (const path of ["/?ui_locale=en-US", "/prompt/poster?prompt_locale=en-US",
      "/?prompt_locale=zh-CN", "/?q=cat", "/?model=x", "/?ratio=1:1",
      "/?source_language=en-US", "/?unknown=1", "/category/art?tag=x",
      "/tag/cinematic?unknown=1", "/prompt/poster?page=2"]) {
      expect(policy(path)).toBe("no-store");
    }
    expect(policy("/", { headers: { Cookie: "ui_locale=en-US" } })).toBe("no-store");
    expect(policy("/prompt/poster", { headers: { Cookie: "session=secret" } })).toBe("no-store");
  });

  it("never caches admin, errors, writes or Set-Cookie responses", () => {
    for (const path of ["/admin", "/admin/prompts", "/ADMIN", "/%61dmin/preview",
      "/admin%2Fpreview"]) expect(policy(path)).toBe("no-store");
    expect(policy("/admin", undefined, html(403))).toBe("no-store");
    expect(policy("/missing", undefined, html(404))).toBe("no-store");
    expect(policy("/prompt/gone", undefined, html(410))).toBe("no-store");
    expect(policy("/", undefined, html(500))).toBe("no-store");
    expect(policy("/", { method: "POST" })).toBe("no-store");
    expect(policy("/", undefined, html(200, { "Set-Cookie": "ui_locale=en-US" })))
      .toBe("no-store");
  });

  it("uses a short crawler policy and preserves non-document asset headers", () => {
    for (const path of ["/robots.txt", "/sitemap.xml"]) {
      expect(policy(path, undefined, new Response("ok", { headers: { "Content-Type": "text/plain" } })))
        .toBe(PUBLIC_CRAWLER_CACHE);
      expect(policy(`${path}?x=1`, undefined,
        new Response("ok", { headers: { "Content-Type": "text/plain" } }))).toBe("no-store");
    }
    const asset = new Response("asset", { headers: {
      "Content-Type": "application/javascript", "Cache-Control": "public, max-age=31536000, immutable",
    } });
    expect(policy("/assets/index.js", undefined, asset))
      .toBe("public, max-age=31536000, immutable");
    expect(policy("/resource", undefined, new Response("error", { status: 404,
      headers: { "Content-Type": "application/json" } }))).toBe("no-store");
    expect(policy("/resource", undefined, new Response("json", { headers: {
      "Content-Type": "application/json",
    } }))).toBeNull();
  });
});

describe("root locale cookie", () => {
  it("only sets a cookie for an explicit UI locale query", () => {
    const plain = rootLoader({ request: request("/") } as Parameters<typeof rootLoader>[0]);
    const switched = rootLoader({ request: request("/?ui_locale=en-US") } as Parameters<typeof rootLoader>[0]);
    expect(plain.init?.headers).toBeUndefined();
    expect(switched.init?.headers).toMatchObject({ "Set-Cookie": expect.stringContaining("ui_locale=en-US") });
  });
});

describe("request summary", () => {
  it("logs a fixed field set without query, credentials or body", () => {
    const input = request("/admin?token=secret", {
      method: "POST", headers: { "cf-ray": "ray-1", Cookie: "private=1",
        Authorization: "Bearer secret", "Cf-Access-Jwt-Assertion": "jwt-secret" },
      body: "prompt body and variable value",
    });
    const summary = requestSummary(input, 403, 17);
    expect(summary).toEqual({ requestId: "ray-1", method: "POST", pathname: "/admin",
      status: 403, durationMs: 17, admin: true });
    expect(JSON.stringify(summary)).not.toMatch(/secret|private|prompt body|jwt-secret/);
    expect(requestSummary(request("/"), 200, 1).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
