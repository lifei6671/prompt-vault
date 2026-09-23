import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import routes from "../app/routes";
import { guardAdminRequest, loadAdmin } from "../app/services/admin-route.server";
import {
  requireAdmin,
  requireAdminWriteOrigin,
  type AdminSecurityConfig,
} from "../app/services/admin-auth.server";

const config: AdminSecurityConfig = {
  CF_ACCESS_ISSUER: "https://test-team.cloudflareaccess.com",
  CF_ACCESS_AUD: "test-audience",
  ADMIN_EMAILS: " Admin@Example.com , second@example.com ",
};
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let localKeys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  localKeys = createLocalJWKSet({
    keys: [{ ...await exportJWK(pair.publicKey), kid: "test-key", alg: "RS256", use: "sig" }],
  });
});

function sign(overrides: {
  issuer?: string;
  audience?: string | string[];
  email?: string;
  expired?: boolean;
  key?: CryptoKey;
} = {}) {
  const claims = overrides.email === undefined ? { email: "ADMIN@example.com" } : { email: overrides.email };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(overrides.issuer ?? config.CF_ACCESS_ISSUER!)
    .setAudience(overrides.audience ?? config.CF_ACCESS_AUD!)
    .setIssuedAt()
    .setExpirationTime(overrides.expired ? Math.floor(Date.now() / 1000) - 60 : "1h")
    .sign(overrides.key ?? privateKey);
}

function request(token?: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Cf-Access-Jwt-Assertion", token);
  return new Request("https://vault.disign.me/admin", { ...options, headers });
}

async function rejectedStatus(operation: () => Promise<unknown> | void): Promise<number> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).headers.get("Cache-Control")).toBe("no-store");
    return (error as Response).status;
  }
  throw new Error("Expected request to be rejected");
}

describe("Cloudflare Access admin verification", () => {
  it("accepts a signed Access JWT with exact issuer and audience and an allowlisted email", async () => {
    await expect(requireAdmin(request(await sign()), config, localKeys)).resolves.toBeUndefined();
    await expect(requireAdmin(request(await sign({ email: "second@example.com" })), config, localKeys))
      .resolves.toBeUndefined();
  });

  it("rejects missing, wrong-issuer, wrong-audience, wrong-signature, and expired tokens", async () => {
    expect(await rejectedStatus(() => requireAdmin(request(), config, localKeys))).toBe(401);
    for (const token of [
      await sign({ issuer: "https://other.cloudflareaccess.com" }),
      await sign({ audience: "other-audience" }),
      await sign({ key: otherPrivateKey }),
      await sign({ expired: true }),
      await sign({ audience: ["test-audience", "other-audience"] }),
    ]) {
      expect(await rejectedStatus(() => requireAdmin(request(token), config, localKeys))).toBe(401);
    }
  });

  it("rejects missing email and non-admin Access identity", async () => {
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(config.CF_ACCESS_ISSUER!)
      .setAudience(config.CF_ACCESS_AUD!)
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await rejectedStatus(() => requireAdmin(request(noEmail), config, localKeys))).toBe(401);
    const readerToken = await sign({ email: "reader@example.com" });
    expect(await rejectedStatus(() =>
      requireAdmin(request(readerToken), config, localKeys),
    )).toBe(403);
  });

  it("fails closed for missing or invalid server security configuration", async () => {
    const token = await sign();
    for (const invalid of [
      {},
      { ...config, CF_ACCESS_ISSUER: "http://test-team.cloudflareaccess.com" },
      { ...config, CF_ACCESS_ISSUER: "https://test-team.cloudflareaccess.com/other" },
      { ...config, CF_ACCESS_ISSUER: "https://evil.example" },
      { ...config, CF_ACCESS_AUD: "" },
      { ...config, ADMIN_EMAILS: "admin@example.com," },
      { ...config, ADMIN_EMAILS: "invalid-email" },
    ]) {
      expect(await rejectedStatus(() => requireAdmin(request(token), invalid, localKeys))).toBe(503);
    }
  });
});

describe("admin route boundary", () => {
  it("accepts only the exact write origin and same-origin fetch site", async () => {
    const good = { Origin: "https://vault.disign.me", "Sec-Fetch-Site": "same-origin" };
    expect(() => requireAdminWriteOrigin(request(undefined, { method: "POST", headers: good })))
      .not.toThrow();
    for (const headers of [
      { "Sec-Fetch-Site": "same-origin" },
      { Origin: "https://other.example", "Sec-Fetch-Site": "same-origin" },
      { Origin: "https://vault.disign.me.evil.example", "Sec-Fetch-Site": "same-origin" },
      { Origin: "https://vault.disign.me/", "Sec-Fetch-Site": "same-origin" },
      { Origin: "https://vault.disign.me", "Sec-Fetch-Site": "cross-site" },
      { Origin: "https://vault.disign.me" },
    ]) {
      expect(await rejectedStatus(() => requireAdminWriteOrigin(request(undefined, { method: "POST", headers }))))
        .toBe(403);
    }
  });

  it("gates descendants before their loader/action and marks admin responses no-store", async () => {
    const token = await sign();
    let reached = false;
    const next = async () => {
      reached = true;
      return new Response("child content");
    };
    expect(await rejectedStatus(() => guardAdminRequest(request(), config, next, localKeys))).toBe(401);
    expect(reached).toBe(false);
    const response = await guardAdminRequest(request(token), config, next, localKeys);
    expect(reached).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    reached = false;
    expect(await rejectedStatus(() =>
      guardAdminRequest(request(token, { method: "POST" }), config, next, localKeys),
    )).toBe(403);
    expect(reached).toBe(false);
    const written = await guardAdminRequest(request(token, {
      method: "POST", headers: { Origin: "https://vault.disign.me", "Sec-Fetch-Site": "same-origin" },
    }), config, next, localKeys);
    expect(written.status).toBe(200);
  });

  it("uses requireAdmin in the admin loader and returns no-store data", async () => {
    expect(await rejectedStatus(() => loadAdmin(request(), config, localKeys))).toBe(401);
    const result = await loadAdmin(request(await sign()), config, localKeys);
    expect(result.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    expect(result.data.locale).toBe("zh-CN");
  });

  it("keeps public routes outside the admin parent gate", () => {
    const admin = routes.find((route) => route.path === "admin");
    expect(admin?.children?.some((child) => child.index)).toBe(true);
    for (const path of [undefined, "prompt/:slug", "category/:slug", "tag/:slug", "robots.txt", "sitemap.xml"]) {
      expect(routes.some((route) => route.path === path && route !== admin)).toBe(true);
    }
  });
});
