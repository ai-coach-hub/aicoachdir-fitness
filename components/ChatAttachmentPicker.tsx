"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import styles from "./ChatAttachmentPicker.module.css";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSION = new Set(["jpg", "jpeg", "png", "webp", "pdf", "docx", "xlsx", "csv", "txt"]);
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv,.txt";

type SelectedFile = { name: string; kind: "photo" | "document"; size: number; preview?: string };

export default function ChatAttachmentPicker({
  disabled = false,
  onPendingChange,
}: {
  disabled?: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => () => {
    generation.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function remove() {
    generation.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFile(null);
    setError("");
    setBusy(false);
    if (picker.current) picker.current.value = "";
    onPendingChange(false);
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    if (!selected) return;
    const requestId = ++generation.current;
    // Disable sending text while an attachment is under inspection.
    onPendingChange(true);
    setBusy(true);
    setError("");
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFile(null);
    try {
      const ext = selected.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSION.has(ext) || !selected.size || selected.size > MAX_BYTES)
        throw new Error("Choose a JPG, PNG, WebP, PDF, Word, Excel, CSV, or TXT file under 8 MB.");
      const isImage = IMAGE_TYPES.includes(selected.type);
      if (["jpg", "jpeg", "png", "webp"].includes(ext) !== isImage)
        throw new Error("The selected file format does not match its extension.");
      if (!isImage) {
        const formats: Record<string, string> = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          csv: "text/csv",
          txt: "text/plain",
        };
        if (selected.type && selected.type !== formats[ext])
          throw new Error("The document type does not match its extension.");
        if (generation.current === requestId)
          setFile({ name: selected.name.slice(0, 120), kind: "document", size: selected.size });
        return;
      }
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(selected);
      } catch {
        throw new Error("This image could not be opened.");
      }
      try {
        if (!bitmap.width || !bitmap.height || bitmap.width > 7000 || bitmap.height > 7000)
          throw new Error("Image dimensions are outside the supported range.");
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to preview this image.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        // Re-encoding removes EXIF and GPS; no original bytes leave the browser.
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
        if (!jpeg || jpeg.size > 2 * 1024 * 1024) throw new Error("Unable to prepare an image under 2 MB.");
        const url = URL.createObjectURL(jpeg);
        if (generation.current !== requestId) {
          URL.revokeObjectURL(url);
          return;
        }
        previewRef.current = url;
        setFile({ name: selected.name.slice(0, 120), kind: "photo", size: jpeg.size, preview: url });
      } finally {
        bitmap.close();
      }
    } catch (failure) {
      if (generation.current === requestId) {
        setError(failure instanceof Error ? failure.message : "Unable to preview this file.");
        onPendingChange(false);
      }
    } finally {
      if (generation.current === requestId) setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <input
        ref={picker}
        className={styles.visuallyHidden}
        type="file"
        accept={ACCEPT}
        aria-label="Choose a file to attach"
        disabled={disabled || busy}
        onChange={(event) => { void choose(event); }}
      />
      <button
        type="button"
        className={styles.addButton}
        disabled={disabled || busy}
        onClick={() => picker.current?.click()}
      >
        <span aria-hidden="true">＋</span> Add file
      </button>
      {busy ? <span className={styles.note} role="status">Preparing file…</span> : null}
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
      {file ? (
        <div className={styles.chip} role="status">
          {file.kind === "photo" && file.preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={file.preview} alt="Local photo attachment preview" className={styles.thumbnail} />
          ) : <span aria-hidden="true">📄</span>}
          <span className={styles.fileName} title={file.name}>{file.name}</span>
          <span className={styles.size}>{Math.ceil(file.size / 1024)} KB</span>
          <button type="button" onClick={remove} className={styles.remove} aria-label="Remove attached file">Remove</button>
          <span className={styles.note}>Preview only. File sending is not enabled.</span>
        </div>
      ) : null}
    </div>
  );
}
