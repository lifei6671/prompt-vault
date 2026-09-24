import { useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, ReactNode } from "react";

export function handleImagePaste(
  event: Pick<ClipboardEvent, "clipboardData" | "preventDefault">, onImage: (file: File) => void,
) {
  const image = Array.from(event.clipboardData.items ?? []).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile()
    ?? Array.from(event.clipboardData.files ?? []).find((file) => file.type.startsWith("image/"));
  if (image) { event.preventDefault(); onImage(image); }
}

export function handleImageDrop(
  event: Pick<DragEvent, "dataTransfer" | "preventDefault">, onImage: (file: File) => void,
) {
  event.preventDefault();
  const image = [...event.dataTransfer.files].find((file) => file.type.startsWith("image/"));
  if (image) onImage(image);
}

export function AdminImageDropzone({ onImage, inputLabel, buttonLabel, uploading, children }: {
  onImage: (file: File) => void; inputLabel: string; buttonLabel: string; uploading: boolean; children: ReactNode;
}) {
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const imageInput = useRef<HTMLInputElement>(null);
  return <div className={dragActive ? "admin-import-dropzone admin-import-dropzone-active" : "admin-import-dropzone"}
    onDragEnter={(event) => {
      if (uploading || !event.dataTransfer.types.includes("Files")) return;
      dragDepth.current += 1;
      setDragActive(true);
    }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={() => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragActive(false);
    }}
    onDrop={(event) => {
      dragDepth.current = 0;
      setDragActive(false);
      handleImageDrop(event, (file) => { if (!uploading) onImage(file); });
    }}>
    <input ref={imageInput} className="admin-new-upload-input" type="file"
      accept="image/jpeg,image/png,image/webp" aria-label={inputLabel} disabled={uploading}
      onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onImage(file); event.currentTarget.value = ""; }} />
    <button type="button" className="admin-secondary-action" disabled={uploading}
      aria-busy={uploading || undefined} onClick={() => imageInput.current?.click()}>
      {uploading && <span className="admin-button-spinner" aria-hidden="true" />}{buttonLabel}</button>
    {children}
  </div>;
}
