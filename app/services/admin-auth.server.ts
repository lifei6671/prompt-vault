import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AdminSecurityConfig {
  CF_ACCESS_ISSUER?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
}

let remoteKeys: { issuer: string; keySet: JWTVerifyGetKey } | undefined;

function unavailable(): Response {
  return new Response("Admin security is not configured", {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
}

function readConfig(config: AdminSecurityConfig) {
  const { CF_ACCESS_ISSUER: issuer, CF_ACCESS_AUD: audience, ADMIN_EMAILS: emails } = config;
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(issuer ?? "");
  } catch {
    throw unavailable();
  }
  if (issuerUrl.protocol !== "https:" || issuerUrl.origin !== issuer ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuerUrl.hostname) ||
    !audience || !/^[A-Za-z0-9_-]+$/.test(audience) || !emails) {
    throw unavailable();
  }
  const allowlist = emails.split(",").map((email) => email.trim().toLowerCase());
  if (allowlist.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))) {
    throw unavailable();
  }
  return { issuer, audience, allowlist };
}

export async function requireAdmin(
  request: Request,
  config: AdminSecurityConfig,
  keySet?: JWTVerifyGetKey,
): Promise<void> {
  const { issuer, audience, allowlist } = readConfig(config);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const keys = keySet ?? (() => {
    if (remoteKeys?.issuer !== issuer) {
      remoteKeys = {
        issuer,
        keySet: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      };
    }
    return remoteKeys.keySet;
  })();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iss", "aud"],
    }));
  } catch {
    throw new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (payload.aud !== audience &&
    !(Array.isArray(payload.aud) && payload.aud.length === 1 && payload.aud[0] === audience)) {
    throw new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (typeof payload.email !== "string" || !payload.email) {
    throw new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!allowlist.includes(payload.email.toLowerCase())) {
    throw new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}

export function requireAdminWriteOrigin(request: Request): void {
  if (request.headers.get("Origin") !== "https://vault.disign.me" ||
    request.headers.get("Sec-Fetch-Site") !== "same-origin") {
    throw new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}
