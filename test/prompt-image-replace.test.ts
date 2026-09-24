import { env } from "cloudflare:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import routes from "../app/routes";
import AdminPromptEdit, { action, loader } from "../app/routes/admin-prompt-edit";
import { loader as imageLoader } from "../app/routes/admin-prompt-image";
import * as imageUploadHook from "../app/lib/use-prompt-image-upload";
import { getAdminPrompt, listPromptTaxonomy, mutateAdminPrompt } from "../app/services/prompt-admin.server";
import { getPromptDetail } from "../app/services/prompt-detail.server";
import { imageKeys, uploadOriginal, uploadPreview } from "../app/services/image-upload.server";
import { isImageUnavailable } from "../app/services/image-reference.server";
import { replacePromptImage } from "../app/services/prompt-image.server";
import migration1 from "../migrations/0001_init.sql?raw";
import migration2 from "../migrations/0002_i18n.sql?raw";
import migration3 from "../migrations/0003_retired_image_keys.sql?raw";
import migration4 from "../migrations/0004_reference_image_requirement.sql?raw";

async function migrate(sql: string) {
  for (const statement of sql.split(";").map((part) => part.replace(/^--.*$/gm, "").trim()).filter(Boolean))
    await env.DB.prepare(statement).run();
}
beforeAll(async () => {
  await migrate(migration1);
  await migrate(migration2);
  await migrate(migration3);
  await migrate(migration4);
  await env.DB.prepare("INSERT INTO categories (id,name,slug,created_at,updated_at) VALUES (1,'分类','category','now','now')").run();
});
function png(width = 1200, height = 800) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
function webp(width = 768, height = 512) {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0]);
  const w = width - 1, h = height - 1;
  bytes.set([w & 255, w >> 8 & 255, w >> 16 & 255, h & 255, h >> 8 & 255], 24);
  return bytes;
}
function request(bytes: Uint8Array, mime: string) {
  return new Request("https://vault.disign.me/admin/prompts/new/image/original", {
    method: "PUT", body: bytes, headers: { "Content-Type": mime, "Content-Length": String(bytes.length) },
  });
}
async function pair(width = 1200) {
  const { reference } = await uploadOriginal(env.IMAGES, request(png(width), "image/png"));
  await uploadPreview(env.IMAGES, env.DB, request(webp(), "image/webp"), reference);
  return reference;
}
async function create(slug: string, reference?: string) {
  reference ??= await pair();
  const keys = imageKeys(reference);
  await env.DB.prepare(`INSERT INTO prompts (slug,title,prompt_template,category_id,
    original_image_key,preview_image_key,original_content_type,original_width,original_height,
    preview_width,preview_height,original_size_bytes,preview_size_bytes,image_alt,status,
    source_language,published_at,created_at,updated_at)
    VALUES (?,'Title','Body',1,?,?,'image/png',1200,800,768,512,33,30,'Alt','published',
      'zh-CN','2020-01-01T00:00:00.000Z','now','now')`).bind(slug, keys.original, keys.preview).run();
  const row = await env.DB.prepare("SELECT id FROM prompts WHERE slug = ?").bind(slug).first<{ id: number }>();
  return { id: row!.id, reference, keys };
}
function intent(name: string, reference?: string) {
  const form = new FormData();
  form.set("_intent", name);
  if (reference) form.set("upload_reference", reference);
  return form;
}
async function exists(reference: string) {
  const keys = imageKeys(reference);
  return [!!await env.IMAGES.head(keys.original), !!await env.IMAGES.head(keys.preview)];
}
const replacement = (id: number, reference: string, db = env.DB, bucket = env.IMAGES) =>
  replacePromptImage(db, bucket, id, intent("replace_image", reference));

describe("Phase 4E image lifecycle", () => {
  it("switches every image field in one batch, then deletes only the old pair", async () => {
    const old = await create("replace-success");
    const next = await pair(900);
    let batches = 0;
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: (statements: D1PreparedStatement[]) => {
      batches++; return env.DB.batch(statements);
    } } as D1Database;
    await replacement(old.id, next, db);
    expect(batches).toBe(1);
    expect(await getAdminPrompt(env.DB, old.id)).toMatchObject({
      original_image_key: imageKeys(next).original, preview_image_key: imageKeys(next).preview,
      original_content_type: "image/png", original_width: 900, original_height: 800,
      preview_width: 768, preview_height: 512, original_size_bytes: 33, preview_size_bytes: 30,
      updated_at: expect.stringMatching(/^20\d{2}-/), slug: "replace-success", status: "published", published_at: "2020-01-01T00:00:00.000Z",
    });
    expect(await exists(old.reference)).toEqual([false, false]);
    expect(await exists(next)).toEqual([true, true]);
  });
  it("rolls back a failing batch and compensates new objects", async () => {
    const old = await create("replace-rollback");
    const next = await pair();
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: (statements: D1PreparedStatement[]) =>
      env.DB.batch([...statements, env.DB.prepare("INSERT INTO prompt_tags (prompt_id,tag_id) VALUES (0,999)")]),
    } as D1Database;
    await expect(replacement(old.id, next, db)).rejects.toThrow();
    expect((await getAdminPrompt(env.DB, old.id)).original_image_key).toBe(old.keys.original);
    expect(await exists(old.reference)).toEqual([true, true]);
    expect(await exists(next)).toEqual([false, false]);
  });
  it("returns 404 for a missing Prompt and compensates its uploaded pair", async () => {
    const next = await pair();
    await expect(replacement(999999, next)).rejects.toMatchObject({ status: 404 });
    expect(await exists(next)).toEqual([false, false]);
  });
  it("keeps the old pair when D1 fails unexpectedly", async () => {
    const old = await create("replace-db-offline");
    const next = await pair();
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: async () => {
      throw new Error("D1 unavailable");
    } } as unknown as D1Database;
    await expect(replacement(old.id, next, db)).rejects.toThrow("D1 unavailable");
    expect((await getAdminPrompt(env.DB, old.id)).original_image_key).toBe(old.keys.original);
    expect(await exists(old.reference)).toEqual([true, true]);
    expect(await exists(next)).toEqual([false, false]);
  });
  it("a failed duplicate preview PUT preserves a pair bound after its precheck", async () => {
    const contender = await create("preview-race-contender");
    const next = await pair();
    const keys = imageKeys(next);
    expect(await isImageUnavailable(env.DB, keys.original)).toBe(false);
    let bound = false;
    const bucket = {
      head: async (key: string) => {
        if (!bound) { bound = true; await replacement(contender.id, next); }
        return env.IMAGES.head(key);
      },
      put: env.IMAGES.put.bind(env.IMAGES),
      delete: async () => { throw new Error("must not delete bound images"); },
    } as R2Bucket;
    await expect(uploadPreview(bucket, env.DB, request(webp(), "image/webp"), next))
      .rejects.toMatchObject({ status: 409 });
    expect((await getAdminPrompt(env.DB, contender.id)).original_image_key).toBe(keys.original);
    expect(await exists(next)).toEqual([true, true]);
  });
  it("retirement blocks a bind between failed-batch compensation and R2 delete", async () => {
    const target = await create("compensation-race-target");
    const contender = await create("compensation-race-contender");
    const next = await pair();
    let attempted = false;
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: async () => {
      throw new Error("D1 unavailable");
    } } as unknown as D1Database;
    const bucket = { head: env.IMAGES.head.bind(env.IMAGES), delete: async (keys: string[]) => {
      attempted = true;
      await expect(replacement(contender.id, next)).rejects.toMatchObject({ status: 409 });
      await env.IMAGES.delete(keys);
    } } as R2Bucket;
    await expect(replacement(target.id, next, db, bucket)).rejects.toThrow("D1 unavailable");
    expect(attempted).toBe(true);
    expect((await getAdminPrompt(env.DB, contender.id)).original_image_key).toBe(contender.keys.original);
    expect(await exists(next)).toEqual([false, false]);
  });
  it("retires old keys inside the replacement batch before old R2 cleanup", async () => {
    const target = await create("retired-old-target");
    const contender = await create("retired-old-contender");
    const next = await pair();
    let attempted = false;
    const bucket = { head: env.IMAGES.head.bind(env.IMAGES), delete: async (keys: string[]) => {
      attempted = true;
      await expect(replacement(contender.id, target.reference)).rejects.toMatchObject({ status: 409 });
      await env.IMAGES.delete(keys);
    } } as R2Bucket;
    await replacement(target.id, next, env.DB, bucket);
    expect(attempted).toBe(true);
    expect((await getAdminPrompt(env.DB, target.id)).original_image_key).toBe(imageKeys(next).original);
    expect((await getAdminPrompt(env.DB, contender.id)).original_image_key).toBe(contender.keys.original);
    expect(await exists(next)).toEqual([true, true]);
    expect(await exists(target.reference)).toEqual([false, false]);
  });
  it("rejects a reference bound to another Prompt and keeps its objects", async () => {
    const current = await create("replace-bound-current");
    const bound = await create("replace-bound-owner");
    await expect(replacement(current.id, bound.reference)).rejects.toMatchObject({ status: 409 });
    expect((await getAdminPrompt(env.DB, current.id)).original_image_key).toBe(current.keys.original);
    expect(await exists(bound.reference)).toEqual([true, true]);
  });
  it("rejects missing or mismatched head metadata as 409", async () => {
    const current = await create("replace-head");
    const missing = await pair();
    await env.IMAGES.delete(imageKeys(missing).preview);
    await expect(replacement(current.id, missing)).rejects.toMatchObject({ status: 409 });
    const mismatched = await pair();
    await env.IMAGES.put(imageKeys(mismatched).preview, webp(), {
      httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { role: "original", reference: mismatched, width: "768", height: "512" },
    });
    await expect(replacement(current.id, mismatched)).rejects.toMatchObject({ status: 409 });
    expect((await getAdminPrompt(env.DB, current.id)).original_image_key).toBe(current.keys.original);
  });
  it("lets one replace win and cleans only the losing new pair", async () => {
    const old = await create("replace-race");
    const winner = await pair();
    const loser = await pair();
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: async (statements: D1PreparedStatement[]) => {
      await replacement(old.id, winner);
      return env.DB.batch(statements);
    } } as D1Database;
    await expect(replacement(old.id, loser, db)).rejects.toMatchObject({ status: 409 });
    expect((await getAdminPrompt(env.DB, old.id)).original_image_key).toBe(imageKeys(winner).original);
    expect(await exists(winner)).toEqual([true, true]);
    expect(await exists(loser)).toEqual([false, false]);
    expect(await exists(old.reference)).toEqual([false, false]);
  });
  it("deletes the final pair when replace wins before soft delete", async () => {
    const old = await create("replace-before-delete");
    const next = await pair();
    await replacement(old.id, next);
    await mutateAdminPrompt(env.DB, old.id, intent("delete"), env.IMAGES);
    expect(await exists(old.reference)).toEqual([false, false]);
    expect(await exists(next)).toEqual([false, false]);
    await expect(getPromptDetail(env.DB, "replace-before-delete", "zh-CN", null))
      .rejects.toMatchObject({ status: 410 });
  });
  it("rejects replace when delete wins before its batch and compensates new objects", async () => {
    const old = await create("delete-before-replace");
    const next = await pair();
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: async (statements: D1PreparedStatement[]) => {
      await mutateAdminPrompt(env.DB, old.id, intent("delete"), env.IMAGES);
      return env.DB.batch(statements);
    } } as D1Database;
    await expect(replacement(old.id, next, db)).rejects.toMatchObject({ status: 409 });
    expect(await exists(old.reference)).toEqual([false, false]);
    expect(await exists(next)).toEqual([false, false]);
    await expect(getPromptDetail(env.DB, "delete-before-replace", "zh-CN", null))
      .rejects.toMatchObject({ status: 410 });
  });
  it("soft delete preserves a pair shared with another active historical Prompt", async () => {
    const first = await create("shared-delete-first");
    const second = await create("shared-delete-second", first.reference);
    await mutateAdminPrompt(env.DB, first.id, intent("delete"), env.IMAGES);
    expect((await getAdminPrompt(env.DB, first.id)).deleted_at).not.toBeNull();
    expect((await getAdminPrompt(env.DB, second.id)).deleted_at).toBeNull();
    expect(await exists(first.reference)).toEqual([true, true]);
    expect((await getPromptDetail(env.DB, "shared-delete-second", "zh-CN", null)).slug)
      .toBe("shared-delete-second");
  });
  it("keeps committed DB states when best-effort R2 deletes fail", async () => {
    const old = await create("replace-cleanup-fails");
    const next = await pair();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const bucket = { head: env.IMAGES.head.bind(env.IMAGES), delete: async () => { throw new Error("R2 down"); } } as R2Bucket;
    try {
      await replacement(old.id, next, env.DB, bucket);
      expect((await getAdminPrompt(env.DB, old.id)).original_image_key).toBe(imageKeys(next).original);
      expect(await exists(next)).toEqual([true, true]);
      const deleted = await create("delete-cleanup-fails");
      await mutateAdminPrompt(env.DB, deleted.id, intent("delete"), bucket);
      expect((await getAdminPrompt(env.DB, deleted.id)).deleted_at).not.toBeNull();
      await expect(getPromptDetail(env.DB, "delete-cleanup-fails", "zh-CN", null))
        .rejects.toMatchObject({ status: 410 });
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it("rejects deleted Prompt replacement, and keeps admin responses no-store", async () => {
    const old = await create("deleted-replace");
    await mutateAdminPrompt(env.DB, old.id, intent("delete"), env.IMAGES);
    const next = await pair();
    await expect(replacement(old.id, next)).rejects.toMatchObject({ status: 409 });
    expect(await exists(next)).toEqual([false, false]);
    const response = await action({ params: { id: String(old.id) }, request: new Request(
      `https://vault.disign.me/admin/prompts/${old.id}/edit`, { method: "POST", body: intent("replace_image", next) },
    ) } as Parameters<typeof action>[0]);
    expect(response.init?.status).toBe(409);
    expect(response.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const fresh = await create("route-replace");
    const uploaded = await pair();
    const success = await action({ params: { id: String(fresh.id) }, request: new Request(
      `https://vault.disign.me/admin/prompts/${fresh.id}/edit`, { method: "POST", body: intent("replace_image", uploaded) },
    ) } as Parameters<typeof action>[0]);
    expect(success.status).toBe(303);
    expect(success.headers.get("Cache-Control")).toBe("no-store");
    const loaded = await loader({ params: { id: String(fresh.id) } } as Parameters<typeof loader>[0]);
    expect(loaded.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    for (const locale of ["zh-CN", "en-US"] as const) {
      const render = (prompt: Awaited<ReturnType<typeof getAdminPrompt>>) => {
        const router = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: locale }),
          children: [{ index: true, element: createElement(AdminPromptEdit, {
            loaderData: { prompt, taxonomy: { categories: [], tags: [] } }, actionData: undefined,
          } as Parameters<typeof AdminPromptEdit>[0]) }] }]);
        return renderToStaticMarkup(createElement(RouterProvider, { router }));
      };
      const editableHtml = render(await getAdminPrompt(env.DB, fresh.id));
      expect(editableHtml).toContain(locale === "zh-CN" ? "替换图片" : "Replace image");
      expect(editableHtml).toContain('class="admin-new-upload-layout"');
      expect(editableHtml).toContain('class="admin-new-upload-preview"');
      expect(editableHtml).toContain(`src="/admin/prompts/${fresh.id}/image"`);
      expect(editableHtml).toContain('class="admin-new-upload-input"');
      expect(editableHtml).toContain('accept="image/jpeg,image/png,image/webp"');
      expect(editableHtml).toContain('class="admin-import-dropzone"');
      expect(editableHtml).toContain(locale === "zh-CN" ? "选择图片" : "Choose image");
      const deletedHtml = render(await getAdminPrompt(env.DB, old.id));
      expect(deletedHtml).not.toContain('name="_intent" value="replace_image"');
      expect(deletedHtml).not.toContain('class="admin-import-dropzone"');
    }
    const previewSpy = vi.spyOn(imageUploadHook, "usePromptImageUpload").mockReturnValue({
      reference: "", state: "uploading", previewUrl: "blob:local-webp-preview", fileName: "next.png",
      originalWidth: 1200, originalHeight: 800, detectedRatio: "3:2", onImage: vi.fn(),
    });
    try {
      const locale = "en-US";
      const prompt = await getAdminPrompt(env.DB, fresh.id);
      const router = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: locale }),
        children: [{ index: true, element: createElement(AdminPromptEdit, {
          loaderData: { prompt, taxonomy: { categories: [], tags: [] } }, actionData: undefined,
        } as Parameters<typeof AdminPromptEdit>[0]) }] }]);
      const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
      expect(html).toContain('src="blob:local-webp-preview"');
      expect(html).not.toContain(`src="/admin/prompts/${fresh.id}/image"`);
    } finally { previewSpy.mockRestore(); }
    const admin = routes.find((route) => route.path === "admin");
    expect(admin?.children?.some((route) => route.path === "prompts/new/image/:kind")).toBe(true);
    expect(admin?.children?.some((route) => route.path === "prompts/:id/image")).toBe(true);
    const image = await imageLoader({ params: { id: String(fresh.id) } } as Parameters<typeof imageLoader>[0]);
    expect(image.headers.get("Content-Type")).toBe("image/webp");
    expect(image.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(webp());
    await expect(imageLoader({ params: { id: "999999" } } as Parameters<typeof imageLoader>[0]))
      .rejects.toMatchObject({ status: 404 });
    await expect(imageLoader({ params: { id: "invalid" } } as Parameters<typeof imageLoader>[0]))
      .rejects.toMatchObject({ status: 400 });
  });
});
