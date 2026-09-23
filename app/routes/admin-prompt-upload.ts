import { env } from "cloudflare:workers";
import type { Route } from "./+types/admin-prompt-upload";
import { UploadError, imageKeys, uploadOriginal, uploadPreview } from "../services/image-upload.server";
import { isImageUnavailable } from "../services/image-reference.server";

export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "no-store" });
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT") return new Response("Method Not Allowed", {
    status: 405, headers: { "Cache-Control": "no-store", Allow: "PUT" },
  });
  try {
    if (params.kind === "original") {
      const result = await uploadOriginal(env.IMAGES, request);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (params.kind === "preview") {
      const reference = request.headers.get("X-Upload-Reference") ?? "";
      const keys = imageKeys(reference);
      if (await isImageUnavailable(env.DB, keys.original)) throw new UploadError(409, "missingUpload");
      await uploadPreview(env.IMAGES, env.DB, request, reference);
      return Response.json({ reference }, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadError) return Response.json({ error: error.code }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
    console.error("Image upload failed", { kind: params.kind, error: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
