"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./PhotoPreview.module.css";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_EDGE_PX = 1600;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type PreparedPhoto = {
  objectUrl: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string;
};

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
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [note, setNote] = useState("Could you review my exercise setup and suggest any adjustments?");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeTask = useRef(0);
  const photoRef = useRef<PreparedPhoto | null>(null);

  useEffect(() => {
    photoRef.current = photo;
  }, [photo]);
  useEffect(() => () => {
    activeTask.current += 1;
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.objectUrl);
  }, []);

  function removePhoto() {
    activeTask.current += 1;
    setProcessing(false);
    setError("");
    setPhoto((previous) => {
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      return null;
    });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const task = ++activeTask.current;
    setProcessing(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      if (task !== activeTask.current) {
        URL.revokeObjectURL(prepared.objectUrl);
        return;
      }
      setPhoto((previous) => {
        if (previous) URL.revokeObjectURL(previous.objectUrl);
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
        <h1>Ask your coach about a photo</h1>
        <p className={styles.lead}>
          Select a photo of your exercise position, gym equipment, or workout setup.
          Add what you want feedback on. This preview prepares the photo on your device.
        </p>
        <div className={styles.notice} role="status">
          Photo sending is not enabled yet. Nothing is uploaded, saved, or sent to Pickaxe,
          and opening this preview does not use any AI messages or credits.
        </div>

        <section className={styles.panel} aria-label="Prepare a coaching photo">
          <label htmlFor="coach-photo" className={styles.label}>1. Choose a photo</label>
          <input
            id="coach-photo"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={processing}
            onChange={pickPhoto}
            className={styles.file}
          />
          <p className={styles.micro}>JPEG, PNG or WebP, up to 8 MB. One image per message.</p>
          {processing ? <p role="status">Preparing your photo privately on this device...</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          {photo ? (
            <div className={styles.imagePanel}>
              {/* Blob URL is only used inside this browser tab and is never sent to a server. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.objectUrl} alt="Selected exercise or equipment photo preview" className={styles.preview} />
              <div className={styles.photoMeta}>
                <span>Prepared JPEG · {photo.width} × {photo.height} · {Math.ceil(photo.bytes / 1024)} KB</span>
                <button type="button" className={styles.subtleButton} onClick={removePhoto}>Remove photo</button>
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
            placeholder="Example: Is my home workout setup appropriate for this exercise?"
          />
          <p className={styles.micro}>{note.length}/1200 characters</p>
          <button type="button" className={styles.primary} disabled title="Secure photo delivery to the coach is not yet connected">
            Send photo to Fitness Coach (coming next)
          </button>
          <p className={styles.micro}>
            The button stays disabled until private storage and secure image delivery are verified.
            No photo will be sent by this preview.
          </p>
        </section>

        <section className={styles.info}>
          <button type="button" className={styles.subtleButton} onClick={() => setShowDetails((previous) => !previous)}>
            {showDetails ? "Hide" : "Show"} privacy and coaching details
          </button>
          {showDetails ? (
            <div className={styles.details}>
              <p>Your browser resizes the photo to at most 1600 pixels on its longest edge and converts it to JPEG. This removes embedded camera location metadata. The image remains in this tab.</p>
              <p>A still picture can help a coach comment on visible setup and positioning, but cannot establish movement quality, injury risk, or a medical diagnosis.</p>
              <p>Do not include identifiable bystanders, financial documents, medical records, or anything you would not want sent to an AI service once uploads are enabled.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
