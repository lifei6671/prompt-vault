import { isAdminPath } from "./response-policy";

export function requestSummary(request: Request, status: number, durationMs: number) {
  const pathname = new URL(request.url).pathname;
  return {
    requestId: request.headers.get("cf-ray") || crypto.randomUUID(),
    method: request.method,
    pathname,
    status,
    durationMs,
    admin: isAdminPath(pathname),
  };
}
