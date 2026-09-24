import { env } from "cloudflare:workers";
import type { Route } from "./+types/admin-prompt-image";
import { parsePromptId, PromptAdminError } from "../services/prompt-admin.server";

export async function loader({ params }: Route.LoaderArgs) {
  let id: number;
  try { id = parsePromptId(params.id); }
  catch (error) {
    if (error instanceof PromptAdminError) throw new Response(null, { status: error.status });
    throw error;
  }
  const prompt = await env.DB.prepare("SELECT preview_image_key FROM prompts WHERE id = ?")
    .bind(id).first<{ preview_image_key: string }>();
  if (!prompt) throw new Response(null, { status: 404 });
  const image = await env.IMAGES.get(prompt.preview_image_key);
  if (!image) throw new Response(null, { status: 404 });
  return new Response(image.body, {
    headers: { "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
