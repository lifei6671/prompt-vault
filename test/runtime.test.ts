import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Cloudflare Workers bindings", () => {
  it("provides D1 and R2 bindings", async () => {
    const result = await env.DB.prepare("SELECT 1 AS value").first<{ value: number }>();
    const objects = await env.IMAGES.list({ limit: 1 });

    expect(result?.value).toBe(1);
    expect(objects.objects).toEqual([]);
  });
});
