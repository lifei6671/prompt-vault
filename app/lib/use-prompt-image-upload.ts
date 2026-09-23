import { useEffect, useRef, useState } from "react";
import { createPreview } from "./create-preview.client";
import { ORIGINAL_MAX_BYTES, PREVIEW_MAX_BYTES } from "../services/image-header";

export function usePromptImageUpload() {
  const [reference, setReference] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "ready" | "failed">("idle");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const currentUpload = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewBlob]);
  useEffect(() => () => currentUpload.current?.abort(), []);

  async function onImage(file: File | undefined) {
    currentUpload.current?.abort();
    const controller = new AbortController();
    currentUpload.current = controller;
    setReference("");
    setPreviewBlob(null);
    setPreviewUrl("");
    if (!file) { setState("idle"); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > ORIGINAL_MAX_BYTES) {
      setState("failed"); return;
    }
    setState("uploading");
    try {
      const preview = await createPreview(file);
      if (preview.size > PREVIEW_MAX_BYTES) throw new Error("preview_too_large");
      const originalResult = await fetch("/admin/prompts/new/image/original", {
        method: "PUT", body: file, headers: { "Content-Type": file.type }, signal: controller.signal,
      });
      if (!originalResult.ok) throw new Error("original_upload_failed");
      const { reference: issued } = await originalResult.json() as { reference: string };
      const previewResult = await fetch("/admin/prompts/new/image/preview", {
        method: "PUT", body: preview,
        headers: { "Content-Type": "image/webp", "X-Upload-Reference": issued },
        signal: controller.signal,
      });
      if (!previewResult.ok) throw new Error("preview_upload_failed");
      if (currentUpload.current !== controller) return;
      setReference(issued);
      setPreviewBlob(preview);
      setState("ready");
    } catch {
      if (currentUpload.current === controller) setState("failed");
    }
  }
  return { reference, state, previewUrl, onImage };
}