import { retireUnboundImageKey } from "./image-reference.server";
import { ImageError, HEADER_MAX_BYTES, ORIGINAL_MAX_BYTES, PREVIEW_MAX_BYTES,
  PREVIEW_MAX_EDGE, parseImageHeader, type ImageHeader } from "./image-header";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const REFERENCE = /^(20\d{2})\/(0[1-9]|1[0-2])\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(jpg|png|webp)$/;
export class UploadError extends Error {
  constructor(public status: 400 | 409 | 413, public code: "invalid" | "missingUpload" | "tooLarge") { super(code); }
}
export function imageKeys(reference: string) {
  const match = REFERENCE.exec(reference);
  if (!match) throw new UploadError(400, "invalid");
  const [, year, month, uuid, ext] = match;
  const base = `prompts/${year}/${month}/${uuid}`;
  return { original: `${base}/original.${ext}`, preview: `${base}/preview.webp` };
}
function referenceFor(ext: ImageHeader["ext"]) {
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}/${ext}`;
}
export async function cleanupImages(bucket: R2Bucket, reference: string) {
  const keys = imageKeys(reference);
  await cleanupImageKeys(bucket, [keys.original, keys.preview], "upload_compensation");
}
export async function cleanupImageKeys(bucket: R2Bucket, keys: string[], operation: string) {
  if (!keys.length) return;
  try { await bucket.delete(keys); }
  catch (error) { console.error("R2 cleanup failed", { operation, keys, error: error instanceof Error ? error.name : "unknown" }); }
}
async function readHeader(request: Request, limit: number) {
  const rawLength = request.headers.get("Content-Length");
  const length = Number(rawLength);
  if (!rawLength || !Number.isSafeInteger(length) || length <= 0 || !request.body)
    throw new UploadError(400, "invalid");
  if (length > limit) throw new UploadError(413, "tooLarge");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let header = new Uint8Array(0);
  let count = 0;
  let image: ImageHeader | null = null;
  try {
    while (!image) {
      const { done, value } = await reader.read();
      if (done) throw new UploadError(400, "invalid");
      count += value.byteLength;
      if (count > length || count > limit)
        throw new UploadError(count > limit ? 413 : 400, count > limit ? "tooLarge" : "invalid");
      chunks.push(value);
      const take = Math.min(value.byteLength, HEADER_MAX_BYTES - header.length);
      const next = new Uint8Array(header.length + take);
      next.set(header);
      next.set(value.subarray(0, take), header.length);
      header = next;
      image = parseImageHeader(header);
      if (!image && header.length === HEADER_MAX_BYTES) throw new UploadError(400, "invalid");
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ImageError) throw new UploadError(error.status, error.status === 413 ? "tooLarge" : "invalid");
    throw error;
  }
  const prefix = chunks;
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index < prefix.length) { controller.enqueue(prefix[index++]); return; }
      const { done, value } = await reader.read();
      if (done) {
        if (count !== length) { controller.error(new UploadError(400, "invalid")); return; }
        controller.close();
        return;
      }
      count += value.byteLength;
      if (count > length || count > limit) {
        controller.error(new UploadError(count > limit ? 413 : 400, count > limit ? "tooLarge" : "invalid"));
        await reader.cancel().catch(() => {});
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { image, length, stream };
}
async function putImage(bucket: R2Bucket, key: string, reference: string, role: "original" | "preview",
  request: Request, max: number, mime: string) {
  const { image, length, stream } = await readHeader(request, max);
  if (request.headers.get("Content-Type") !== mime || image.mime !== mime ||
    (role === "preview" && Math.max(image.width, image.height) > PREVIEW_MAX_EDGE)) {
    await stream.cancel();
    throw new UploadError(400, "invalid");
  }
  const fixed = new FixedLengthStream(length);
  const abort = new AbortController();
  const piping = stream.pipeTo(fixed.writable, { signal: abort.signal });
  try {
    const [object] = await Promise.all([bucket.put(key, fixed.readable, {
      onlyIf: new Headers({ "If-None-Match": "*" }),
      httpMetadata: { contentType: mime, cacheControl: CACHE_CONTROL },
      customMetadata: { width: String(image.width), height: String(image.height), role, reference },
    }), piping]);
    if (!object) throw new UploadError(409, "missingUpload");
    if (object.size !== length) throw new UploadError(400, "invalid");
  } catch (error) {
    abort.abort();
    const [pipeResult] = await Promise.allSettled([piping]);
    if (pipeResult.status === "rejected" && pipeResult.reason instanceof UploadError) throw pipeResult.reason;
    throw error;
  }
  return image;
}
export async function uploadOriginal(bucket: R2Bucket, request: Request) {
  const mime = request.headers.get("Content-Type");
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp")
    throw new UploadError(400, "invalid");
  // The reference is issued only after the magic/header has been checked.
  const { image, length, stream } = await readHeader(request, ORIGINAL_MAX_BYTES);
  if (image.mime !== mime) {
    await stream.cancel();
    throw new UploadError(400, "invalid");
  }
  const reference = referenceFor(image.ext);
  const keys = imageKeys(reference);
  const fixed = new FixedLengthStream(length);
  const abort = new AbortController();
  const piping = stream.pipeTo(fixed.writable, { signal: abort.signal });
  try {
    const [object] = await Promise.all([bucket.put(keys.original, fixed.readable, {
      httpMetadata: { contentType: mime, cacheControl: CACHE_CONTROL },
      customMetadata: { width: String(image.width), height: String(image.height), role: "original", reference },
    }), piping]);
    if (!object || object.size !== length) throw new UploadError(400, "invalid");
    return { reference };
  } catch (error) {
    abort.abort();
    const [pipeResult] = await Promise.allSettled([piping]);
    await cleanupImages(bucket, reference);
    if (pipeResult.status === "rejected" && pipeResult.reason instanceof UploadError) throw pipeResult.reason;
    throw error;
  }
}
export async function uploadPreview(bucket: R2Bucket, db: D1Database, request: Request, reference: string) {
  const keys = imageKeys(reference);
  try {
    const original = await bucket.head(keys.original);
    if (!original || original.customMetadata?.role !== "original" ||
      original.customMetadata?.reference !== reference) throw new UploadError(409, "missingUpload");
    await putImage(bucket, keys.preview, reference, "preview", request, PREVIEW_MAX_BYTES, "image/webp");
  } catch (error) {
    if (await retireUnboundImageKey(db, keys.original)) await cleanupImages(bucket, reference);
    throw error;
  }
}
function validHead(object: R2Object | null, reference: string, role: "original" | "preview",
  mime: string, max: number) {
  const width = Number(object?.customMetadata?.width);
  const height = Number(object?.customMetadata?.height);
  if (!object || object.customMetadata?.reference !== reference || object.customMetadata?.role !== role ||
    object.httpMetadata?.contentType !== mime || object.httpMetadata?.cacheControl !== CACHE_CONTROL ||
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    !Number.isSafeInteger(object.size) || object.size <= 0 || object.size > max ||
    (role === "preview" && Math.max(width, height) > PREVIEW_MAX_EDGE))
    throw new UploadError(409, "missingUpload");
  return { width, height, size: object.size };
}
export async function headImages(bucket: R2Bucket, reference: string) {
  const keys = imageKeys(reference);
  const ext = reference.slice(reference.lastIndexOf("/") + 1);
  const mime = ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
  const [original, preview] = await Promise.all([bucket.head(keys.original), bucket.head(keys.preview)]);
  return { keys, mime,
    original: validHead(original, reference, "original", mime, ORIGINAL_MAX_BYTES),
    preview: validHead(preview, reference, "preview", "image/webp", PREVIEW_MAX_BYTES) };
}
