import { data } from "react-router";
import type { JWTVerifyGetKey } from "jose";
import { readUiLocale } from "../lib/explore";
import {
  requireAdmin,
  requireAdminWriteOrigin,
  type AdminSecurityConfig,
} from "./admin-auth.server";

export async function guardAdminRequest(
  request: Request,
  config: AdminSecurityConfig,
  next: () => Promise<Response>,
  keySet?: JWTVerifyGetKey,
): Promise<Response> {
  await requireAdmin(request, config, keySet);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    requireAdminWriteOrigin(request);
  }
  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function loadAdmin(request: Request, config: AdminSecurityConfig, keySet?: JWTVerifyGetKey) {
  await requireAdmin(request, config, keySet);
  return data({ locale: readUiLocale(request) }, { headers: { "Cache-Control": "no-store" } });
}
