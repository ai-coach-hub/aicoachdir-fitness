"use client";

import { useState } from "react";

const PHOTO_MARKER = /\n\[Attached photo reference: ([a-f0-9-]{36})\]$/;

export default function ChatPhotoAttachment({ text }: { text: string }) {
  const marker = text.match(PHOTO_MARKER);
  const id = marker?.[1] || "";
  const displayed = id ? text.slice(0, -marker![0].length) : text;
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    if (!id || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/coach-attachments?id=" + encodeURIComponent(id),
        { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok || typeof payload.photoUrl !== "string")
        throw new Error(payload.error || "This attachment is unavailable.");
      setImage(payload.photoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retrieve private photo.");
    } finally { setLoading(false); }
  }

  return (
    <span style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {displayed}
      {id ? (
        <span style={{ display: "block", marginTop: 8 }}>
          <button type="button" disabled={loading} onClick={() => void open()}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #aa78d3",
              background: "#ede4f5", color: "#402a54", cursor: "pointer", font: "inherit" }}>
            {loading ? "Opening private photo…" : "View attached photo"}
          </button>
          {error ? <span role="alert" style={{ display: "block", color: "#a51e42" }}>{error}</span> : null}
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt="Private photo attached to this conversation"
              style={{ display: "block", marginTop: 8, maxWidth: 250, maxHeight: 300,
                objectFit: "contain", borderRadius: 9 }} />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
