"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./AttachmentHistory.module.css";

type Attachment = {
  id: string;
  name: string;
  bytes: number;
  coach: string;
  conversationId: string;
  createdAt: string;
  expiresAt: string;
  memberEmail?: string;
};

export default function PrivateAttachmentHistory() {
  const [member, setMember] = useState("");
  const [ownerMode, setOwnerMode] = useState(false);
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState<{ id: string; url: string } | null>(null);

  const path = (attachmentId?: string, attachedMember?: string) => {
    const p = new URLSearchParams();
    if (ownerMode) {
      p.set("scope", "owner");
      const selectedMember = (attachedMember || member).trim().toLowerCase();
      if (selectedMember) p.set("member", selectedMember);
    }
    if (attachmentId) p.set("id", attachmentId);
    return "/api/coach-attachments?" + p;
  };

  async function load() {
    setError("");
    setActiveImage(null);
    setBusy(true);
    try {
      const response = await fetch(path(), { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to load attachments.");
      setItems(json.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load attachments.");
      setItems([]);
    } finally { setBusy(false); }
  }

  async function open(id: string, attachedMember?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path(id, attachedMember), { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok || !json.photoUrl)
        throw new Error(json.error || "Private photo unavailable.");
      setActiveImage({ id, url: json.photoUrl });
    } catch (e) { setError(e instanceof Error ? e.message : "Private photo unavailable."); }
    finally { setBusy(false); }
  }

  async function remove(id: string, attachedMember?: string) {
    if (!window.confirm("Permanently delete this stored photo?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/coach-attachments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...(ownerMode ? { member: (attachedMember || member).trim().toLowerCase() } : {}) }),
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to delete photo.");
      setItems(items => items.filter(item => item.id !== id));
      if (activeImage?.id === id) setActiveImage(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm deletion."); }
    finally { setBusy(false); }
  }

  return (
    <main className={styles.page}>
      <Link href="/fitness/chat" className={styles.back}>Back to coach</Link>
      <h1>Private coach attachments</h1>
      <p>Attachments from verified conversations are visible here for up to seven days. Signed photo links expire shortly after opening. No file is publicly listed.</p>
      <label className={styles.control}>
        <input type="checkbox" checked={ownerMode} onChange={e => {
          setOwnerMode(e.target.checked);
          setItems([]); setActiveImage(null); setError("");
        }} />
        Owner view (requires server-approved owner access; shows 40 recent photos)
      </label>
      {ownerMode ? (
        <label className={styles.control}>Member email
          <input type="email" autoComplete="off" value={member}
            onChange={e => setMember(e.target.value)} placeholder="Optional: filter by member email" />
        </label>
      ) : null}
      <button type="button" className={styles.button} onClick={() => void load()}
        disabled={busy}>Show attachments</button>
      {busy ? <p role="status">Working…</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.items}>
        {items.map(item => (
          <article className={styles.item} key={item.id}>
            <div><strong>{item.name}</strong><div className={styles.detail}>
              {item.coach} · {Math.ceil(item.bytes / 1024)} KB · {new Date(item.createdAt).toLocaleDateString()}
              {ownerMode && item.memberEmail ? " · " + item.memberEmail : ""}
            </div></div>
            <button type="button" disabled={busy} onClick={() => void open(item.id, item.memberEmail)}>View</button>
            <button type="button" disabled={busy} onClick={() => void remove(item.id, item.memberEmail)}>Delete</button>
          </article>
        ))}
        {!busy && !error && items.length === 0 ? <p>No stored photos loaded.</p> : null}
      </div>
      {activeImage ? (
        <section className={styles.view}>
          <p>Private image (this link expires after two minutes)</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeImage.url} alt="Private member attachment" />
        </section>
      ) : null}
    </main>
  );
}
