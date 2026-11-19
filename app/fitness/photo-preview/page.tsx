"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./PhotoPreview.module.css";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_EDGE_PX = 1600;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF document",
  "text/plain": "Text file",
  "text/csv": "CSV spreadsheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel spreadsheet",
};
const FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.docx,.xlsx";
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

type PreparedPhoto = {
  objectUrl: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string;
};

type PreparedDocument = {
  kind: "document";
  originalName: string;
  bytes: number;
  label: string;
};
type PreparedAttachment = ({ kind: "image" } & PreparedPhoto) | PreparedDocument;

function safeDocumentType(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const expected = DOCUMENT_EXTENSIONS[ext];
  if (!expected) return null;
  // Browsers may omit MIME types for plain text or CSV. Reject any conflicting
  // declared MIME; actual content is not parsed or transmitted in this preview.
  if (file.type && file.type !== expected) return null;
  return expected;
}

async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (ACCEPTED_TYPES.includes(file.type)) {
    const prepared = await preparePhoto(file);
    return { kind: "image", ...prepared };
  }
  const type = safeDocumentType(file);
  if (!type) throw new Error("Choose a photo, PDF, Word document, Excel spreadsheet, CSV or text file.");
  if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("Choose a document smaller than 8 MB.");
  }
  // No FileReader, object URL, rendering, parsing or upload of document bytes.
  return { kind: "document", originalName: file.name.slice(0, 120), bytes: file.size, label: DOCUMENT_TYPES[type] };
}

async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP photo. GIFs, videos and other files are not supported.");
  }
  if (file.size === 0 || file.size > MAX_INPUT_BYTES) {
    throw new Error("Choose a photo smaller than 8 MB.");
  }

  // Decode actual pixels instead of trusting extensions or browser-reported MIME.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The selected image could not be opened.");
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 7000 || bitmap.height > 7000) {
      throw new Error("The image dimensions are outside the supported range.");
    }

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare the photo.");

    // Flatten alpha against white and convert to JPEG; this removes metadata
    // such as embedded EXIF / GPS and bounds the upload payload.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78)
    );
    if (!blob || blob.size === 0 || blob.size > MAX_OUTPUT_BYTES) {
      throw new Error("The photo could not be compressed within 2 MB.");
    }
    return {
      objectUrl: URL.createObjectURL(blob),
      bytes: blob.size,
      width,
      height,
      originalName: file.name.slice(0, 120),
    };
  } finally {
    bitmap.close();
  }
}

export default function FitnessPhotoPreview() {
  const [attachment, setAttachment] = useState<PreparedAttachment | null>(null);
  const [note, setNote] = useState("Could you review this file and share practical feedback?");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeTask = useRef(0);
  const attachmentRef = useRef<PreparedAttachment | null>(null);

  useEffect(() => {
    attachmentRef.current = attachment;
  }, [attachment]);
  useEffect(() => () => {
    activeTask.current += 1;
    if (attachmentRef.current?.kind === "image") URL.revokeObjectURL(attachmentRef.current.objectUrl);
  }, []);

  function removeAttachment() {
    activeTask.current += 1;
    setProcessing(false);
    setError("");
    setAttachment((previous) => {
      if (previous?.kind === "image") URL.revokeObjectURL(previous.objectUrl);
      return null;
    });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function pickAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const task = ++activeTask.current;
    setProcessing(true);
    setError("");
    try {
      const prepared = await prepareAttachment(file);
      if (task !== activeTask.current) {
        if (prepared.kind === "image") URL.revokeObjectURL(prepared.objectUrl);
        return;
      }
      setAttachment((previous) => {
        if (previous?.kind === "image") URL.revokeObjectURL(previous.objectUrl);
        return prepared;
      });
    } catch (failure) {
      if (task === activeTask.current) {
        setError(failure instanceof Error ? failure.message : "Could not prepare that photo.");
      }
    } finally {
      if (task === activeTask.current) setProcessing(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/fitness/chat" className={styles.back}>Back to Fitness Coach</Link>
        <p className={styles.eyebrow}>PRIVATE FEATURE PREVIEW</p>
        <h1>Attach a file for coach feedback</h1>
        <p className={styles.lead}>
          Choose a photo or common document, then add what you'd like your coach to look at.
          Images are prepared locally; documents are listed by name without opening their contents.
        </p>
        <div className={styles.notice} role="status">
          Sending attachments is not enabled yet. Nothing is uploaded, saved, or sent to Pickaxe,
          and opening this preview does not use any AI messages or credits.
        </div>

        <section className={styles.panel} aria-label="Prepare a coaching attachment">
          <label htmlFor="coach-photo" className={styles.label}>1. Attach a file</label>
          <input
            id="coach-photo"
            ref={fileInput}
            type="file"
            accept={FILE_ACCEPT}
            disabled={processing}
            onChange={pickAttachment}
            className={styles.file}
          />
          <p className={styles.micro}>Photos (JPG, PNG, WebP), PDFs, Word or Excel documents, CSV or TXT. Up to 8 MB; one file per message.</p>
          {processing ? <p role="status">Preparing your attachment privately on this device...</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          {attachment ? (
            <div className={styles.imagePanel}>
              {attachment.kind === "image" ? (
                <>
                  {/* Blob URL stays in this browser tab and is never sent to a server. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attachment.objectUrl} alt="Selected image attachment preview" className={styles.preview} />
                </>
              ) : (
                <div className={styles.documentPanel}>
                  <span aria-hidden="true" className={styles.documentIcon}>📄</span>
                  <div><strong>{attachment.label}</strong><p>Contents are not opened in this preview.</p></div>
                </div>
              )}
              <div className={styles.photoMeta}>
                <span>{attachment.originalName} · {Math.ceil(attachment.bytes / 1024)} KB
                  {attachment.kind === "image" ? ` · ${attachment.width} × ${attachment.height}` : ""}
                </span>
                <button type="button" className={styles.subtleButton} onClick={removeAttachment}>Remove file</button>
              </div>
            </div>
          ) : null}

          <label htmlFor="coach-photo-note" className={styles.label}>2. What would you like feedback on?</label>
          <textarea
            id="coach-photo-note"
            className={styles.note}
            rows={4}
            maxLength={1200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: Can you suggest improvements based on this workout plan or equipment photo?"
          />
          <p className={styles.micro}>{note.length}/1200 characters</p>
          <button type="button" className={styles.primary} disabled title="Secure attachment delivery to the coach is not yet connected">
            Send file to Fitness Coach (coming next)
          </button>
          <p className={styles.micro}>
            The button stays disabled until private storage and secure file processing are verified.
            No files will be sent by this preview.
          </p>
        </section>

        <section className={styles.info}>
          <button type="button" className={styles.subtleButton} onClick={() => setShowDetails((previous) => !previous)}>
            {showDetails ? "Hide" : "Show"} privacy and coaching details
          </button>
          {showDetails ? (
            <div className={styles.details}>
              <p>Your browser resizes photos to at most 1600 pixels on the longest edge and converts them to JPEG, removing embedded camera metadata. Document contents are not opened, parsed, or transmitted. The attachment remains in this tab.</p>
              <p>A still picture can help a coach comment on visible setup and positioning, but cannot establish movement quality, injury risk, or a medical diagnosis. Documents will need a separately reviewed secure extraction process before coaches can interpret their contents.</p>
              <p>Avoid sensitive information such as identifiable bystanders, account numbers, medical records, or anything you would not want sent to an AI service once attachments are enabled.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
