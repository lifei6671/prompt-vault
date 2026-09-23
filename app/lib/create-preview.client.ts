import { PREVIEW_MAX_EDGE } from "../services/image-header";

// createImageBitmap applies EXIF orientation before Canvas receives pixels.
export async function createPreview(file: File): Promise<Blob> {
  if (!("createImageBitmap" in window)) throw new Error("image_decoder_unavailable");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") throw new Error("webp_unavailable");
    return blob;
  } finally {
    bitmap.close();
  }
}
