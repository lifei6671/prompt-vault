import { env } from "cloudflare:test";
import { env as requestEnv } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { observeDatabase } from "../workers/request-metrics";
import { observeRequest, requestSummary } from "../workers/request-log";
import { loadExploreOptions } from "../app/services/explore-options.server";
import { listExplorePrompts } from "../app/services/prompt.server";
import { readExploreFilters } from "../app/lib/explore";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";

const url = "https://vault.disign.me";
const cacheKey = (locale = "zh-CN") => `${url}/__internal-cache/explore-options/${locale}`;

beforeAll(async () => {
  for (const sql of [migration1, migration2]) {
    for (const statement of sql.split(";").map((part) => part.replace(/^--.*$/gm, "").trim()).filter(Boolean))
      await env.DB.prepare(statement).run();
  }
  await env.DB.prepare(`INSERT INTO categories (id, name, slug, created_at, updated_at)
    VALUES (1, 'public category', 'art', 'now', 'now')`).run();
  await env.DB.prepare(`INSERT INTO prompts
    (id, slug, title, prompt_template, category_id, original_image_key, preview_image_key,
     original_content_type, original_width, original_height, preview_width, preview_height,
     original_size_bytes, preview_size_bytes, image_alt, status, published_at, created_at, updated_at)
    VALUES (1, 'public-prompt', 'public title', 'private prompt body', 1, 'original', 'preview',
      'image/png', 1, 1, 1, 1, 1, 1, 'alt', 'published', 'now', 'now', 'now')`).run();
});

beforeEach(async () => {
  const cache = await caches.open("explore-options-v1");
  await Promise.all([cache.delete(cacheKey()), cache.delete(cacheKey("en-US"))]);
});
afterEach(() => vi.restoreAllMocks());

describe("request D1 measurements", () => {
  it("measures first/all/run once each and preserves first row, column, null and missing-column behavior", async () => {
    const observed = observeDatabase(env.DB);
    const original = await env.DB.prepare("SELECT * FROM prompts WHERE id = ?").bind(1).all();
    expect(await observed.db.prepare("SELECT * FROM prompts WHERE id = ?").bind(1).first())
      .toEqual(original.results[0]);
    expect(observed.metrics.d1Queries).toBe(1);
    expect(observed.metrics.d1RowsRead).toBe(original.meta.rows_read);
    expect(await observed.db.prepare("SELECT title FROM prompts WHERE id = 1").first("title"))
      .toBe("public title");
    expect(await observed.db.prepare("SELECT NULL AS value").first("value")).toBeNull();
    expect(await observed.db.prepare("SELECT title FROM prompts WHERE id = 0").first()).toBeNull();
    const originalFailure = await env.DB.prepare("SELECT 1 AS value").first("missing").catch((error: Error) => error);
    await expect(observed.db.prepare("SELECT 1 AS value").first("missing"))
      .rejects.toThrow((originalFailure as Error).message);
    expect(observed.metrics.d1Queries).toBe(5);
    expect(observed.metrics.d1Errors).toBe(1);
    expect(observed.metrics.d1RowsRead).not.toBeNull();
    const result = await observed.db.prepare("SELECT title FROM prompts").all();
    expect(result.results).toEqual([{ title: "public title" }]);
    expect((await observed.db.prepare("UPDATE prompts SET title = title WHERE id = 1").run()).meta.changes).toBe(1);
    expect(observed.metrics.d1Queries).toBe(7);
    await observed.finish();
  });

  it("counts batch statements without double counting and preserves transaction rollback", async () => {
    const observed = observeDatabase(env.DB);
    const sql = ["SELECT * FROM prompts WHERE id = 1", "SELECT * FROM categories WHERE id = 1"];
    const expected = await env.DB.batch(sql.map((query) => env.DB.prepare(query)));
    const result = await observed.db.batch(sql.map((query) => observed.db.prepare(query)));
    expect(result.map((row) => row.results)).toEqual(expected.map((row) => row.results));
    expect(observed.metrics).toMatchObject({ d1Queries: 2, d1Errors: 0,
      d1RowsRead: expected.reduce((sum, row) => sum + row.meta.rows_read, 0) });
    await expect(observed.db.batch([
      observed.db.prepare("UPDATE prompts SET title = ? WHERE id = 1").bind("must roll back"),
      observed.db.prepare("SELECT * FROM missing_table"),
    ])).rejects.toThrow();
    expect(await env.DB.prepare("SELECT title FROM prompts WHERE id = 1").first("title")).toBe("public title");
    expect(observed.metrics).toMatchObject({ d1Queries: 4, d1Errors: 1, d1RowsRead: null });
  });

  it("keeps native raw results and sessions, marking unavailable row metadata as null", async () => {
    const observed = observeDatabase(env.DB);
    expect(await observed.db.prepare("SELECT 1 AS value").raw({ columnNames: true }))
      .toEqual([["value"], [1]]);
    expect(observed.metrics).toMatchObject({ d1Queries: 1, d1RowsRead: null });
    const session = observed.db.withSession("first-primary");
    expect(await session.prepare("SELECT title FROM prompts WHERE id = 1").first("title"))
      .toBe("public title");
    expect((await session.batch([session.prepare("SELECT 1 AS value")]))[0].results).toEqual([{ value: 1 }]);
    expect(observed.metrics.d1Queries).toBe(3);
    expect(() => session.getBookmark()).not.toThrow();
  });

  it("preserves failures and counts failed attempts without inventing row counts", async () => {
    const observed = observeDatabase(env.DB);
    await expect(observed.db.prepare("SELECT * FROM missing_secret_table").all()).rejects.toThrow();
    expect(observed.metrics).toMatchObject({ d1Queries: 1, d1Errors: 1, d1RowsRead: null });
    expect(JSON.stringify(observed.metrics)).not.toContain("missing_secret_table");
  });

  it("preserves exec results and marks unavailable metadata explicitly", async () => {
    const observed = observeDatabase(env.DB);
    const result = await observed.db.exec("SELECT 1;\nSELECT 2;");
    expect(result.count).toBe(2);
    expect(observed.metrics).toMatchObject({ d1Queries: 2, d1RowsRead: null, d1Errors: 0 });
  });
});

describe("request integration and cache events", () => {
  it("records zero work for a response that does not access D1 or the options cache", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = new Response("denied", { status: 403, headers: { "Cache-Control": "no-store" } });
    expect(await observeRequest(new Request(`${url}/admin`), env.DB, async () => response)).toBe(response);
    expect(log.mock.calls[0][0]).toMatchObject({ status: 403, d1Queries: 0, d1RowsRead: 0,
      d1Errors: 0, exploreOptionsCacheHits: 0, exploreOptionsCacheMisses: 0 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports a cold miss and warm hit with six then two queries and fewer rows", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const native = requestEnv.DB;
    const handler = async () => {
      // Exercise the imported env used by the real route loaders, including after await.
      await Promise.resolve();
      const result = await listExplorePrompts(requestEnv.DB, readExploreFilters(new URLSearchParams()), "zh-CN", 1);
      return Response.json(result);
    };
    const coldResponse = await observeRequest(new Request(url), env.DB, handler);
    const warmResponse = await observeRequest(new Request(url), env.DB, handler);
    expect(await coldResponse.json()).toEqual(await warmResponse.json());
    const cold = log.mock.calls[0][0];
    const warm = log.mock.calls[1][0];
    expect(cold).toMatchObject({ status: 200, d1Queries: 6, d1Errors: 0,
      exploreOptionsCacheHits: 0, exploreOptionsCacheMisses: 1 });
    expect(warm).toMatchObject({ status: 200, d1Queries: 2, d1Errors: 0,
      exploreOptionsCacheHits: 1, exploreOptionsCacheMisses: 0 });
    expect(cold.d1RowsRead).toBeGreaterThan(warm.d1RowsRead);
    expect(requestEnv.DB).toBe(native);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("isolates concurrent async requests and leaves the binding unchanged", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let unblock!: () => void;
    const barrier = new Promise<void>((resolve) => { unblock = resolve; });
    let firstDb: D1Database;
    const first = observeRequest(new Request(`${url}/image`), env.DB, async () => {
      firstDb = requestEnv.DB;
      await requestEnv.DB.prepare("SELECT 1 AS value").first();
      await barrier;
      expect(requestEnv.DB).toBe(firstDb);
      await requestEnv.DB.prepare("SELECT 2 AS value").first();
      return new Response("first");
    });
    const second = observeRequest(new Request(`${url}/robots.txt`), env.DB, async () => {
      await requestEnv.DB.prepare("SELECT 3 AS value").first();
      return new Response("second");
    });
    await second;
    unblock();
    await first;
    expect(log.mock.calls.map(([summary]) => ({ pathname: summary.pathname, queries: summary.d1Queries })))
      .toEqual([{ pathname: "/robots.txt", queries: 1 }, { pathname: "/image", queries: 2 }]);
  });

  it("logs errors without exception data and waits for sibling queries after early rejection", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const db = { prepare: () => ({ all: () => barrier.then(() => ({
      results: [], meta: { rows_read: 9 }, success: true,
    })) }) } as unknown as D1Database;
    const failure = new Error("private SQL and input must not be logged");
    let query!: Promise<unknown>;
    const request = observeRequest(new Request(`${url}/prompt/private-slug?q=secret`), db, async () => {
      query = requestEnv.DB.prepare("private SQL").all();
      throw failure;
    });
    await Promise.resolve();
    expect(log).not.toHaveBeenCalled();
    release();
    await expect(request).rejects.toBe(failure);
    await query;
    expect(log.mock.calls[0][0]).toMatchObject({ pathname: "/prompt/:slug", status: 500,
      d1Queries: 1, d1RowsRead: 9 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret/);
  });

  it("reports no cache access separately from cache read/write errors", async () => {
    const observed = observeDatabase(env.DB);
    expect(observed.metrics).toMatchObject({ exploreOptionsCacheHits: 0, exploreOptionsCacheMisses: 0 });
    const cache = await caches.open("explore-options-v1");
    vi.spyOn(caches, "open").mockResolvedValue(cache);
    vi.spyOn(cache, "match").mockRejectedValue(new Error("secret read error"));
    vi.spyOn(cache, "put").mockRejectedValue(new Error("secret write error"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await loadExploreOptions(observed.db, "zh-CN")).categories)
      .toEqual([{ slug: "art", name: "public category" }]);
    expect(observed.metrics).toMatchObject({ exploreOptionsCacheHits: 0, exploreOptionsCacheMisses: 0,
      exploreOptionsCacheReadErrors: 1, exploreOptionsCacheWriteErrors: 1, d1Queries: 4, d1Errors: 0 });
    expect(warning.mock.calls.every((call) => call.length === 1)).toBe(true);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("secret");
  });

  it("does not log request content, path identifiers, arbitrary headers or unknown paths", () => {
    for (const [path, route] of [["/prompt/private-slug", "/prompt/:slug"],
      ["/image/tag/private-tag", "/image/tag/:slug"], ["/admin/prompts/123/edit", "/admin/prompts/:id/edit"],
      ["/admin/prompts/new/image/private-kind", "/admin/prompts/new/image/:kind"],
      ["/private-unknown-path", "/other"], ["/admin/private-path", "/admin/*"]]) {
      const summary = requestSummary(new Request(`${url}${path}?q=private-search&token=secret`, {
        method: "POST", body: "private prompt and variable values",
        headers: { Cookie: "session=private-cookie", Authorization: "Bearer private-token",
          "Cf-Access-Jwt-Assertion": "private-jwt", "cf-ray": "private-invalid-ray", "User-Agent": "private-agent" },
      }), 200, 1);
      expect(summary.pathname).toBe(route);
      expect(summary.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(summary).toMatchObject({ d1Queries: 0, d1RowsRead: 0 });
      expect(JSON.stringify(summary)).not.toMatch(/private|secret/);
    }
  });
});
