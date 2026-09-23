export const ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;
export const PREVIEW_MAX_BYTES = 3 * 1024 * 1024;
export const HEADER_MAX_BYTES = 64 * 1024;
export const PREVIEW_MAX_EDGE = 768;

export type ImageHeader = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp"; width: number; height: number };
export class ImageError extends Error {
  constructor(public status: 400 | 413) { super(status === 413 ? "too_large" : "invalid_image"); }
}
const invalid = (): never => { throw new ImageError(400); };
const size = (width: number, height: number, mime: ImageHeader["mime"], ext: ImageHeader["ext"]): ImageHeader => {
  if (!width || !height || width > 100_000 || height > 100_000) invalid();
  return { width, height, mime, ext };
};
const eq = (bytes: Uint8Array, offset: number, values: number[]) =>
  values.every((value, index) => bytes[offset + index] === value);
const be16 = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
const be32 = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]);

// null means a valid prefix needs more bytes. The caller stops at HEADER_MAX_BYTES.
export function parseImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length >= 4 && !eq(bytes, 0, [0x89, 0x50, 0x4e, 0x47]) &&
    !eq(bytes, 0, [0xff, 0xd8, 0xff]) && !eq(bytes, 0, [0x52, 0x49, 0x46, 0x46]))
    return invalid();
  if (bytes.length < 12) return null;
  if (eq(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    if (bytes.length < 33) return null;
    if (!eq(bytes, 8, [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])) invalid();
    return size(be32(bytes, 16), be32(bytes, 20), "image/png", "png");
  }
  if (eq(bytes, 0, [0xff, 0xd8, 0xff])) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) invalid();
      let marker = offset + 1;
      while (marker < bytes.length && bytes[marker] === 0xff) marker++;
      if (marker >= bytes.length) return null;
      const code = bytes[marker];
      if (code === 0xd9 || code === 0xda) invalid();
      if (code === 0x01 || (code >= 0xd0 && code <= 0xd7)) { offset = marker + 1; continue; }
      if (marker + 2 >= bytes.length) return null;
      const length = be16(bytes, marker + 1);
      if (length < 2) invalid();
      const end = marker + 1 + length;
      if (end > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(code)) {
        if (length < 7 || bytes[marker + 3] !== 8) invalid();
        return size(be16(bytes, marker + 6), be16(bytes, marker + 4), "image/jpeg", "jpg");
      }
      offset = end;
    }
    return null;
  }
  if (eq(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && eq(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    if (bytes.length < 21) return null;
    const tag = String.fromCharCode(...bytes.slice(12, 16));
    if (tag === "VP8X") {
      if (bytes.length < 30) return null;
      if (be32(bytes, 16) !== 0x0a000000) invalid();
      return size(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), "image/webp", "webp");
    }
    if (tag === "VP8 ") {
      if (bytes.length < 30) return null;
      if (!eq(bytes, 23, [0x9d, 0x01, 0x2a])) invalid();
      return size((bytes[26] | bytes[27] << 8) & 0x3fff, (bytes[28] | bytes[29] << 8) & 0x3fff, "image/webp", "webp");
    }
    if (tag === "VP8L") {
      if (bytes.length < 25) return null;
      if (bytes[20] !== 0x2f) invalid();
      return size(1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10), "image/webp", "webp");
    }
    return invalid();
  }
  return invalid();
}
