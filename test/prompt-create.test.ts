import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import routes from "../app/routes";
import { action as uploadAction } from "../app/routes/admin-prompt-upload";
import { loader as editLoader } from "../app/routes/admin-prompt-edit";
import AdminPromptNew, { action as createAction, loader as createLoader } from "../app/routes/admin-prompt-new";
import { handleImageDrop, handleImagePaste } from "../app/components/admin-image-dropzone";
import { parseImageHeader, ORIGINAL_MAX_BYTES, PREVIEW_MAX_BYTES } from "../app/services/image-header";
import { headImages, imageKeys, uploadOriginal, uploadPreview, UploadError } from "../app/services/image-upload.server";
import { createAdminPrompt } from "../app/services/prompt-create.server";
import { createImportedPrompt } from "../app/services/prompt-import.server";
import { getAdminPrompt } from "../app/services/prompt-admin.server";
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
  await env.DB.prepare("INSERT INTO tags (id,name,slug,created_at,updated_at) VALUES (1,'标签','tag','now','now')").run();
});
function png(width = 1200, height = 800) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
function jpeg(width = 1200, height = 800) {
  return new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0,
    255, 192, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3,
    1, 17, 0, 2, 17, 0, 3, 17, 0]);
}
function webp(width = 768, height = 512) {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0]);
  const w = width - 1, h = height - 1;
  bytes.set([w & 255, w >> 8 & 255, w >> 16 & 255, h & 255, h >> 8 & 255, h >> 16 & 255], 24);
  return bytes;
}
function request(bytes: Uint8Array, mime: string, reference?: string, size = bytes.length) {
  return new Request("https://vault.disign.me/admin/prompts/new/image/" + (reference ? "preview" : "original"), {
    method: "PUT", body: bytes, headers: { "Content-Type": mime, "Content-Length": String(size),
      ...(reference ? { "X-Upload-Reference": reference } : {}) },
  });
}
function form(reference: string, slug: string, overrides: Record<string, string> = {}) {
  const result = new FormData();
  const fields = {
    upload_reference: reference, source_language: "zh-CN", slug, title: "原文",
    description: "描述", prompt_template: "{{city}} {{city}}", image_alt: "图片",
    model: "Flux", ratio: "3:2", category_id: "1", translation_locale: "en-US",
    translation_mode: "present", translation_title: "Title", translation_description: "Description",
    translation_prompt_template: "{{city}}", translation_image_alt: "Image",
    variables_json: JSON.stringify([{ key: "city", type: "text", label: "城市", placeholder: null,
      translation_label: "City", translation_placeholder: null, options: null }]),
    ...overrides,
  };
  Object.entries(fields).forEach(([key, value]) => result.set(key, value));
  result.append("tag_ids", "1"); result.append("tag_ids", "1");
  return result;
}
async function uploadPair(original = png(), mime = "image/png", preview = webp()) {
  const { reference } = await uploadOriginal(env.IMAGES, request(original, mime));
  await uploadPreview(env.IMAGES, env.DB, request(preview, "image/webp", reference), reference);
  return reference;
}
describe("Phase 4D image create", () => {
  it("parses PNG, JPEG and WebP dimensions and rejects bad magic, SVG, truncated headers", () => {
    expect(parseImageHeader(png())).toMatchObject({ mime: "image/png", width: 1200, height: 800 });
    expect(parseImageHeader(jpeg())).toMatchObject({ mime: "image/jpeg", width: 1200, height: 800 });
    expect(parseImageHeader(webp())).toMatchObject({ mime: "image/webp", width: 768, height: 512 });
    expect(() => parseImageHeader(new TextEncoder().encode("<svg></svg>"))).toThrow();
    expect(() => parseImageHeader(new Uint8Array(16))).toThrow();
    expect(parseImageHeader(png().slice(0, 18))).toBeNull();
    expect(parseImageHeader(jpeg().slice(0, 15))).toBeNull();
  });
  it("uses only server-derived keys and real R2 metadata", async () => {
    expect(() => imageKeys("2026/09/../png")).toThrow();
    expect(() => imageKeys("prompts/2026/09/id/original.png")).toThrow();
    const reference = await uploadPair();
    const keys = imageKeys(reference);
    expect(keys.original).toMatch(/^prompts\/\d{4}\/\d{2}\/[a-f0-9-]+\/original\.png$/);
    const original = await env.IMAGES.head(keys.original);
    const preview = await env.IMAGES.head(keys.preview);
    expect(original?.httpMetadata).toMatchObject({
      contentType: "image/png", cacheControl: "public, max-age=31536000, immutable",
    });
    expect(original?.customMetadata).toMatchObject({
      width: "1200", height: "800", role: "original", reference,
    });
    expect(preview?.customMetadata).toMatchObject({
      width: "768", height: "512", role: "preview", reference,
    });
    expect((await headImages(env.IMAGES, reference)).original.size).toBe(png().length);
    await env.IMAGES.delete([keys.original, keys.preview]);
    expect(await env.IMAGES.head(keys.original)).toBeNull();
  });
  it("rejects preview MIME and dimensions, then cleans original", async () => {
    const { reference } = await uploadOriginal(env.IMAGES, request(png(), "image/png"));
    await expect(uploadPreview(env.IMAGES, env.DB, request(png(), "image/png", reference), reference))
      .rejects.toMatchObject({ status: 400 });
    expect(await env.IMAGES.head(imageKeys(reference).original)).toBeNull();
    const { reference: large } = await uploadOriginal(env.IMAGES, request(jpeg(), "image/jpeg"));
    await expect(uploadPreview(env.IMAGES, env.DB, request(webp(769, 500), "image/webp", large), large))
      .rejects.toMatchObject({ status: 400 });
    expect(await env.IMAGES.head(imageKeys(large).original)).toBeNull();
  });
  it("propagates an immediate R2 put failure and attempts cleanup", async () => {
    const deleted = vi.fn(async () => {});
    const bucket = { put: async () => { throw new Error("R2 unavailable"); },
      delete: deleted } as unknown as R2Bucket;
    await expect(uploadOriginal(bucket, request(png(), "image/png"))).rejects.toThrow("R2 unavailable");
    expect(deleted).toHaveBeenCalledOnce();
  });
  it("enforces size, zero-byte, truncated and mismatched MIME guards", async () => {
    await expect(uploadOriginal(env.IMAGES, request(png(), "image/png", undefined, ORIGINAL_MAX_BYTES + 1)))
      .rejects.toMatchObject({ status: 413 });
    await expect(uploadOriginal(env.IMAGES, request(new Uint8Array(0), "image/png")))
      .rejects.toMatchObject({ status: 400 });
    await expect(uploadOriginal(env.IMAGES, request(jpeg(), "image/png")))
      .rejects.toMatchObject({ status: 400 });
    await expect(uploadOriginal(env.IMAGES, request(png().slice(0, 18), "image/png")))
      .rejects.toMatchObject({ status: 400 });
    const { reference } = await uploadOriginal(env.IMAGES, request(png(), "image/png"));
    await expect(uploadPreview(env.IMAGES, env.DB, request(webp(), "image/webp", reference, PREVIEW_MAX_BYTES + 1), reference))
      .rejects.toMatchObject({ status: 413 });
    expect(await env.IMAGES.head(imageKeys(reference).original)).toBeNull();
  });
  it("creates one draft batch with server metadata and reads through edit loader service", async () => {
    const reference = await uploadPair();
    let batches = 0;
    const db = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => { batches++; return env.DB.batch(statements); },
    } as unknown as D1Database;
    const id = await createAdminPrompt(db, env.IMAGES, form(reference, "new-draft"));
    expect(batches).toBe(1);
    const edit = await editLoader({ params: { id: String(id) } } as Parameters<typeof editLoader>[0]);
    expect(edit.data.prompt.id).toBe(id);
    expect(await getAdminPrompt(env.DB, id)).toMatchObject({
      slug: "new-draft", status: "draft", published_at: null, source_language: "zh-CN",
      original_width: 1200, original_height: 800, preview_width: 768, preview_height: 512,
      original_size_bytes: png().length, preview_size_bytes: webp().length,
      tagIds: [1], translation: { locale: "en-US", title: "Title" },
      variables: [{ key: "city", translation_label: "City" }],
    });
    await expect(createAdminPrompt(env.DB, env.IMAGES, form(reference, "duplicate-reference")))
      .rejects.toMatchObject({ status: 409 });
    expect(await env.IMAGES.head(imageKeys(reference).original)).not.toBeNull();
  });
  it("persists the reference-image requirement on create and import", async () => {
    const reference = await uploadPair();
    const id = await createAdminPrompt(env.DB, env.IMAGES, form(reference, "reference-create", {
      requires_reference_image: "1",
    }));
    expect((await getAdminPrompt(env.DB, id)).requires_reference_image).toBe(1);
    expect((await env.DB.prepare("SELECT requires_reference_image FROM prompts WHERE id = ?")
      .bind(id).first<{ requires_reference_image: number }>())?.requires_reference_image).toBe(1);
    const bad = form(await uploadPair(), "bad-reference", { requires_reference_image: "true" });
    await expect(createAdminPrompt(env.DB, env.IMAGES, bad)).rejects.toMatchObject({ status: 400 });

    const imported = new FormData();
    imported.set("_mode", "import");
    imported.set("upload_reference", await uploadPair());
    imported.set("import_document", "---\ntitle: Reference import\ncategory: 分类\n---\n## Prompt\nUse the uploaded image");
    const importedId = await createImportedPrompt(env.DB, env.IMAGES, imported);
    expect((await getAdminPrompt(env.DB, importedId)).requires_reference_image).toBe(1);

    const advanced = form(await uploadPair(), "advanced-reference-override");
    advanced.set("_mode", "import_advanced");
    advanced.set("import_document", "---\ntitle: Override\ncategory: 分类\n---\n## Prompt\nUse the uploaded image");
    advanced.set("category_name", "分类");
    advanced.set("tag_names", "");
    const advancedId = await createImportedPrompt(env.DB, env.IMAGES, advanced);
    expect((await getAdminPrompt(env.DB, advancedId)).requires_reference_image).toBe(0);
  });
  it("rejects missing or tampered R2 objects without D1 writes", async () => {
    const reference = await uploadPair();
    const keys = imageKeys(reference);
    await env.IMAGES.delete(keys.preview);
    await expect(createAdminPrompt(env.DB, env.IMAGES, form(reference, "missing-preview")))
      .rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare("SELECT 1 FROM prompts WHERE slug = 'missing-preview'").first()).toBeNull();
    await env.IMAGES.put(keys.preview, webp(), { httpMetadata: { contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { width: "768", height: "512", role: "original", reference } });
    await expect(createAdminPrompt(env.DB, env.IMAGES, form(reference, "tampered-preview")))
      .rejects.toMatchObject({ status: 409 });
    await env.IMAGES.put(keys.preview, webp(), { httpMetadata: { contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { width: "768", height: "512", role: "preview", reference: "2026/09/00000000-0000-4000-8000-000000000000/webp" } });
    await expect(createAdminPrompt(env.DB, env.IMAGES, form(reference, "tampered-reference")))
      .rejects.toMatchObject({ status: 409 });
    await env.IMAGES.delete(keys.original);
    await expect(createAdminPrompt(env.DB, env.IMAGES, form(reference, "missing-original")))
      .rejects.toMatchObject({ status: 409 });
  });
  it("validates source, slug, taxonomy, translation and tokens like edit", async () => {
    const reference = await uploadPair();
    for (const [name, overrides, status] of [
      ["bad-language", { source_language: "fr-FR" }, 400],
      ["bad-slug", { slug: "../bad" }, 400],
      ["bad-category", { category_id: "999" }, 409],
      ["bad-translation", { translation_title: "" }, 400],
      ["bad-tokens", { translation_prompt_template: "{{other}}" }, 400],
      ["bad-variable", { variables_json: "{}" }, 400],
    ] as const) {
      await expect(createAdminPrompt(env.DB, env.IMAGES, form(reference, name, overrides)))
        .rejects.toMatchObject({ status });
    }
    const badTag = form(reference, "bad-tag"); badTag.set("tag_ids", "999");
    await expect(createAdminPrompt(env.DB, env.IMAGES, badTag)).rejects.toMatchObject({ status: 409 });
  });
  it("creates an English source with a Chinese translation", async () => {
    const reference = await uploadPair(webp(600, 400), "image/webp");
    const id = await createAdminPrompt(env.DB, env.IMAGES, form(reference, "english-draft", {
      source_language: "en-US", translation_locale: "zh-CN", title: "Original",
      translation_title: "中文", translation_prompt_template: "{{city}}", translation_image_alt: "图片",
      variables_json: JSON.stringify([{ key: "city", type: "text", label: "City", placeholder: null,
        translation_label: "城市", translation_placeholder: null, options: null }]),
    }));
    expect(await getAdminPrompt(env.DB, id)).toMatchObject({ source_language: "en-US",
      original_content_type: "image/webp", translation: { locale: "zh-CN", title: "中文" } });
  });
  it("rolls back a failed batch and deletes both R2 objects", async () => {
    const reference = await uploadPair();
    const db = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => env.DB.batch([...statements,
        env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (0, 999)")]),
    } as unknown as D1Database;
    await expect(createAdminPrompt(db, env.IMAGES, form(reference, "rollback-draft"))).rejects.toThrow();
    expect(await env.DB.prepare("SELECT 1 FROM prompts WHERE slug = 'rollback-draft'").first()).toBeNull();
    const keys = imageKeys(reference);
    expect(await env.IMAGES.head(keys.original)).toBeNull();
    expect(await env.IMAGES.head(keys.preview)).toBeNull();
  });
  it("returns no-store from upload and create endpoints", async () => {
    const bad = await uploadAction({ request: request(png(), "image/svg+xml"),
      params: { kind: "original" } } as Parameters<typeof uploadAction>[0]);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("Cache-Control")).toBe("no-store");
    const original = await uploadAction({ request: request(png(), "image/png"),
      params: { kind: "original" } } as Parameters<typeof uploadAction>[0]);
    expect(original.status).toBe(200);
    expect(original.headers.get("Cache-Control")).toBe("no-store");
    const { reference } = await original.json() as { reference: string };
    const preview = await uploadAction({ request: request(webp(), "image/webp", reference),
      params: { kind: "preview" } } as Parameters<typeof uploadAction>[0]);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Cache-Control")).toBe("no-store");
    const loaded = await createLoader();
    expect(loaded.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const invalidForm = form(reference, "route-invalid", { slug: "../bad" });
    const invalid = await createAction({ request: new Request("https://vault.disign.me/admin/prompts/new",
      { method: "POST", body: invalidForm }) } as Parameters<typeof createAction>[0]);
    expect(invalid.init?.status).toBe(400);
    expect(invalid.init?.headers).toMatchObject({ "Cache-Control": "no-store" });
    const success = await createAction({ request: new Request("https://vault.disign.me/admin/prompts/new",
      { method: "POST", body: form(reference, "route-created") }) } as Parameters<typeof createAction>[0]);
    expect(success.status).toBe(303);
    expect(success.headers.get("Location")).toMatch(/^\/admin\/prompts\/\d+\/edit$/);
    expect(success.headers.get("Cache-Control")).toBe("no-store");
  });
  it("renders the create form in both admin locales", async () => {
    const loaded = await createLoader();
    for (const locale of ["zh-CN", "en-US"] as const) {
      const router = createMemoryRouter([{ path: "/", element: createElement(Outlet, { context: locale }),
        children: [{ index: true, element: createElement(AdminPromptNew, {
          loaderData: loaded.data, actionData: undefined,
        } as Parameters<typeof AdminPromptNew>[0]) }] }]);
      const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
      expect(html).toContain(locale === "zh-CN" ? "新建 Prompt" : "New prompt");
      expect(html).toContain("source_language");
      expect(html).toContain("upload_reference");
      expect(html).toContain("admin-import-textarea");
      expect(html.indexOf('id="admin-image-title"')).toBeLessThan(html.indexOf('id="admin-import-title"'));
      expect(html).toContain('type="file"');
      expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
      expect(html).toContain('class="admin-new-upload-input"');
      expect(html).toContain(locale === "zh-CN" ? "选择图片" : "Choose image");
      expect(html).toContain("admin-new-upload-preview");
      expect(html).toContain("admin-import-dropzone");
      expect(html).toContain("<details");
      expect(html).not.toContain("<details open");
      expect(html).toContain('disabled=""');
    }
  });
  it("uploads pasted images from clipboard items or files without blocking text paste", () => {
    const image = new File(["image"], "sample.png", { type: "image/png" });
    const onImage = vi.fn();
    const itemEvent = { clipboardData: {
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }], files: [],
    }, preventDefault: vi.fn() } as unknown as Parameters<typeof handleImagePaste>[0];
    handleImagePaste(itemEvent, onImage);
    expect(itemEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onImage).toHaveBeenCalledWith(image);

    const fileEvent = { clipboardData: { files: [image] },
      preventDefault: vi.fn() } as unknown as Parameters<typeof handleImagePaste>[0];
    handleImagePaste(fileEvent, onImage);
    expect(fileEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onImage).toHaveBeenCalledTimes(2);

    const textEvent = { clipboardData: {
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }], files: [],
    }, preventDefault: vi.fn() } as unknown as Parameters<typeof handleImagePaste>[0];
    handleImagePaste(textEvent, onImage);
    expect(textEvent.preventDefault).not.toHaveBeenCalled();
    expect(onImage).toHaveBeenCalledTimes(2);
  });
  it("uploads dropped images through the same image handler", () => {
    const image = new File(["image"], "sample.webp", { type: "image/webp" });
    const onImage = vi.fn();
    const event = { dataTransfer: { files: [
      new File(["text"], "notes.txt", { type: "text/plain" }), image,
    ] }, preventDefault: vi.fn() } as unknown as Parameters<typeof handleImageDrop>[0];
    handleImageDrop(event, onImage);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onImage).toHaveBeenCalledExactlyOnceWith(image);
  });
  it("registers both routes under the admin security boundary", () => {
    const admin = routes.find((route) => route.path === "admin");
    expect(admin?.children?.map((route) => route.path)).toEqual(expect.arrayContaining([
      "prompts/new", "prompts/new/image/:kind",
    ]));
    expect(routes.some((route) => route.path === "prompt/:slug")).toBe(true);
    expect(new UploadError(413, "tooLarge").status).toBe(413);
  });
  it("imports with existing and new taxonomy, stable slugs, server time and unchanged image batch", async () => {
    const markdown = (id: string) => [
      "---", "id: " + id, "title: 一张图片", "category: 新分类", "tags:",
      "  - 标签", "  - 新标签", "model: Flux", "created_at: 1999-01-01", "---",
      "# 一张图片", "## Prompt", "主题：{{主题}}", "副标题：{{可留空}}",
    ].join("\n");
    const imported = async (id: string) => {
      const input = new FormData();
      input.set("_mode", "import");
      input.set("upload_reference", await uploadPair());
      input.set("import_document", markdown(id));
      return createImportedPrompt(env.DB, env.IMAGES, input);
    };
    const firstId = await imported("import-first");
    const first = await getAdminPrompt(env.DB, firstId);
    expect(first).toMatchObject({ slug: "import-first", status: "draft", source_language: "zh-CN",
      ratio: "3:2" });
    expect(first.prompt_template).toBe("主题：{{topic}}\n副标题：{{subtitle}}");
    expect(first.created_at).not.toContain("1999");
    expect(first.variables).toHaveLength(2);
    expect(first.tagIds).toHaveLength(2);
    const category = await env.DB.prepare("SELECT id, slug, source_language FROM categories WHERE name = '新分类'")
      .first<{ id: number; slug: string; source_language: string }>();
    expect(category).toMatchObject({ id: first.category_id, source_language: "zh-CN" });
    expect(category?.slug).toMatch(/^category-[a-f0-9]{8}$/);
    const secondId = await imported("import-second");
    expect((await getAdminPrompt(env.DB, secondId)).category_id).toBe(first.category_id);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM categories WHERE name = '新分类'")
      .first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM tags WHERE name = '新标签'")
      .first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare("SELECT slug FROM tags WHERE name = '新标签'").first<{ slug: string }>())?.slug)
      .toMatch(/^tag-[a-f0-9]{8}$/);
  });

  it("keeps image cleanup on an imported draft batch failure", async () => {
    const reference = await uploadPair();
    const input = new FormData();
    input.set("_mode", "import");
    input.set("upload_reference", reference);
    input.set("import_document", "---\nid: import-rollback\ntitle: Rollback\ncategory: 分类\n---\n## Prompt\nBody");
    const db = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: (statements: D1PreparedStatement[]) => env.DB.batch([...statements,
        env.DB.prepare("INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (0, 999)")]),
    } as unknown as D1Database;
    await expect(createImportedPrompt(db, env.IMAGES, input)).rejects.toThrow();
    expect(await env.IMAGES.head(imageKeys(reference).original)).toBeNull();
    expect(await env.IMAGES.head(imageKeys(reference).preview)).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM prompts WHERE slug = 'import-rollback'").first()).toBeNull();
  });

  it("reuses a translation name and rejects a tampered default import", async () => {
    await env.DB.prepare("INSERT INTO category_translations (category_id, locale, name) VALUES (1, 'en-US', 'Existing Category')").run();
    const input = new FormData();
    input.set("_mode", "import");
    input.set("upload_reference", await uploadPair());
    input.set("import_document", "---\nid: translated-import\ntitle: English title\ncategory: Existing Category\n---\n## Prompt\nEnglish text");
    input.set("category_name", "Malicious replacement");
    const id = await createImportedPrompt(env.DB, env.IMAGES, input);
    expect((await getAdminPrompt(env.DB, id)).category_id).toBe(1);
    expect(await env.DB.prepare("SELECT 1 FROM categories WHERE name = 'Malicious replacement'").first()).toBeNull();
    const invalid = new FormData();
    invalid.set("_mode", "import");
    invalid.set("upload_reference", await uploadPair());
    invalid.set("import_document", "---\ntitle: Broken\n---\n## Prompt\nBody");
    await expect(createImportedPrompt(env.DB, env.IMAGES, invalid)).rejects.toMatchObject({ status: 400 });
  });

});
