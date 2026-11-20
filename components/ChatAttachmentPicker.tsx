"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import styles from "./ChatAttachmentPicker.module.css";

// iPhone photos may arrive as HEIC/HEIF instead of JPEG. All supported
// images are decoded and converted locally to a bounded JPEG before upload.
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const ALLOWED_EXTENSION = new Set([...IMAGE_EXTENSIONS, "pdf", "docx", "xlsx", "csv", "txt"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_PHOTO_BYTES = 30 * 1024 * 1024;
const ACCEPT = "image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv,.txt";

type SelectedFile = { name: string; kind: "photo" | "document"; size: number; preview?: string; readyForChat?: boolean };

export type TextAttachment = { name: string; content: string };
export type PhotoAttachment = { name: string; jpeg: Blob };

// The file body is only read for small plain text or CSV files. Other formats
// remain preview-only until secure processing and model delivery are available.
const MAX_TEXT_BYTES = 16 * 1024;
const MAX_TEXT_CHARS = 3500;
function extractLocalTextAttachment(file: File, text: string): TextAttachment {
  if (!text.trim() || text.includes("\u0000") || /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw new Error("This file is empty or does not contain readable text.");
  if (text.length > MAX_TEXT_CHARS)
    throw new Error("This text or CSV file is too long. Choose one with at most 3,500 characters.");
  return { name: file.name.slice(0, 120), content: text };
}


export default function ChatAttachmentPicker({
  disabled = false,
  onPendingChange,
  onTextAttachment,
  onPhotoAttachment,
  photoSendingEnabled = false,
}: {
  disabled?: boolean;
  onPendingChange: (pending: boolean) => void;
  onTextAttachment?: (attachment: TextAttachment | null) => void;
  onPhotoAttachment?: (attachment: PhotoAttachment | null) => void;
  photoSendingEnabled?: boolean;
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
    onTextAttachment?.(null);
    onPhotoAttachment?.(null);
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
    onTextAttachment?.(null);
    onPhotoAttachment?.(null);
    try {
      const ext = selected.name.split(".").pop()?.toLowerCase() || "";
      const mime = selected.type.toLowerCase();
      const isImage = IMAGE_EXTENSIONS.has(ext);
      if (!ALLOWED_EXTENSION.has(ext)) throw new Error("This file format isn't supported.");
      if (!selected.size) throw new Error("This file is empty.");
      if (selected.size > (isImage ? MAX_SOURCE_PHOTO_BYTES : MAX_BYTES))
        throw new Error(isImage ? "This photo is too large." : "This file is too large.");
      // An empty MIME type is common with iOS Photos; allow it and validate
      // by decoding the image. Never upload the original source bytes.
      if (isImage && mime && !IMAGE_TYPES.has(mime) && mime !== "application/octet-stream")
        throw new Error("This photo couldn't be opened.");
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
        if ((ext === "txt" || ext === "csv") && selected.size <= MAX_TEXT_BYTES) {
          // Local File.text() reads only this file, never persists it or uploads it.
          const text = extractLocalTextAttachment(selected, await selected.text());
          if (generation.current === requestId) {
            onTextAttachment?.(text);
            setFile({ name: text.name, kind: "document", size: selected.size, readyForChat: true });
            // Selecting the file is local-only. Pressing Send shares its text.
            onPendingChange(false);
          }
          return;
        }
        if (generation.current === requestId) {
          setFile({ name: selected.name.slice(0, 120), kind: "document", size: selected.size });
          setError(ext === "txt" || ext === "csv"
            ? "Text and CSV files must be 16 KB or smaller before sending."
            : "This file type can be previewed, but sending isn't enabled yet.");
        }
        return;
      }
      let bitmap: ImageBitmap | null = null;
      let image: HTMLImageElement | null = null;
      let imageObjectUrl: string | null = null;
      try {
        try {
          bitmap = await createImageBitmap(selected);
        } catch {
          // Native iPhone/Safari HEIC support may work through an image element
          // even when createImageBitmap(File) rejects the HEIC container.
          imageObjectUrl = URL.createObjectURL(selected);
          image = new Image();
          image.src = imageObjectUrl;
          try {
            await image.decode();
          } catch {
            throw new Error("This photo couldn't be opened.");
          }
        }
        const width = bitmap?.width ?? image?.naturalWidth ?? 0;
        const height = bitmap?.height ?? image?.naturalHeight ?? 0;
        if (!width || !height || width > 7000 || height > 7000)
          throw new Error("This photo is too large.");
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1600 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This photo couldn't be opened.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage((bitmap ?? image)!, 0, 0, canvas.width, canvas.height);
        // Re-encoding locally removes EXIF and GPS; the original never uploads.
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
        if (!jpeg || jpeg.size > 2 * 1024 * 1024)
          throw new Error("This photo couldn't be prepared.");
        const url = URL.createObjectURL(jpeg);
        if (generation.current !== requestId) {
          URL.revokeObjectURL(url);
          return;
        }
        previewRef.current = url;
        setFile({ name: selected.name.slice(0, 120), kind: "photo", size: jpeg.size, preview: url,
          readyForChat: photoSendingEnabled });
        if (photoSendingEnabled) {
          onPhotoAttachment?.({ name: selected.name.slice(0, 120), jpeg });
          onPendingChange(false);
        }
      } finally {
        bitmap?.close();
        if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
      }
    } catch (failure) {
      if (generation.current === requestId) {
        setError(failure instanceof Error ? failure.message : "This file couldn't be opened.");
        if (picker.current) picker.current.value = "";
        onTextAttachment?.(null);
        onPhotoAttachment?.(null);
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

        </div>
      ) : null}
    </div>
  );
}
