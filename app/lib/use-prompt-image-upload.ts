import { useEffect, useRef, useState } from "react";
import { createPreview } from "./create-preview.client";
import { detectRatio } from "./prompt-import";
import { ORIGINAL_MAX_BYTES, PREVIEW_MAX_BYTES } from "../services/image-header";

export async function createLocalImagePreview(
  file: File, publish: (preview: { blob: Blob; width: number; height: number }) => void,
) {
  const preview = await createPreview(file);
  if (preview.blob.size > PREVIEW_MAX_BYTES) throw new Error("preview_too_large");
  publish(preview);
  return preview;
}

export function usePromptImageUpload() {
  const [reference, setReference] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "ready" | "failed">("idle");
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const currentUpload = useRef<AbortController | null>(null);
  const uploading = useRef(false);
  const currentUrl = useRef("");
  useEffect(() => () => {
    currentUpload.current?.abort();
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
  }, []);

  async function onImage(file: File | undefined) {
    if (uploading.current) return;
    currentUpload.current?.abort();
    const controller = new AbortController();
    currentUpload.current = controller;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = "";
    setReference("");
    setPreviewUrl("");
    setFileName(file?.name ?? "");
    setOriginalWidth(0);
    setOriginalHeight(0);
    if (!file) { setState("idle"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > ORIGINAL_MAX_BYTES) {
      setState("failed"); return;
    }
    uploading.current = true;
    setState("uploading");
    try {
      const preview = await createLocalImagePreview(file, (local) => {
        if (currentUpload.current !== controller) return;
        const url = URL.createObjectURL(local.blob);
        currentUrl.current = url;
        setPreviewUrl(url);
        setOriginalWidth(local.width);
        setOriginalHeight(local.height);
      });
      if (currentUpload.current !== controller) return;
      const originalResult = await fetch("/admin/prompts/new/image/original", {
        method: "PUT", body: file, headers: { "Content-Type": file.type }, signal: controller.signal,
      });
      if (!originalResult.ok) throw new Error("original_upload_failed");
      const { reference: issued } = await originalResult.json() as { reference: string };
      const previewResult = await fetch("/admin/prompts/new/image/preview", {
        method: "PUT", body: preview.blob,
        headers: { "Content-Type": "image/webp", "X-Upload-Reference": issued },
        signal: controller.signal,
      });
      if (!previewResult.ok) throw new Error("preview_upload_failed");
      if (currentUpload.current !== controller) return;
      setReference(issued);
      setState("ready");
    } catch {
      if (currentUpload.current === controller) setState("failed");
    } finally {
      uploading.current = false;
    }
  }
  return { reference, state, previewUrl, fileName, originalWidth, originalHeight,
    detectedRatio: originalWidth && originalHeight ? detectRatio(originalWidth, originalHeight) : "", onImage };
}
