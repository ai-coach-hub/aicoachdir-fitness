"use client";
import { useState, type FormEvent } from "react";

const topics = ["General Question", "Technical Support", "Account / Login", "Billing / Cancellation", "Other"] as const;

export default function SupportContactForm({ defaultTopic = "General Question" }: { defaultTopic?: typeof topics[number] }) {
  const [state, setState] = useState("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("sending");
    try {
      const response = await fetch("/api/support/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), email: data.get("email"), topic: data.get("topic"), message: data.get("message"), website: data.get("website") }),
      });
      if (!response.ok) throw Error("Could not deliver your message.");
      form.reset();
      setState("sent");
    } catch {
      setState("error");
    }
  }
  return (
    <form onSubmit={submit} className="support-contact-form" style={{ display: "grid", gap: 14, maxWidth: 650, marginTop: 16 }}>
      <label style={{ display: "grid", gap: 6 }}>Name <input style={{ width: "100%", padding: 12, borderRadius: 10 }} name="name" autoComplete="name" maxLength={120} required /></label>
      <label style={{ display: "grid", gap: 6 }}>Email <input style={{ width: "100%", padding: 12, borderRadius: 10 }} name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label style={{ display: "grid", gap: 6 }}>Topic <select style={{ width: "100%", padding: 12, borderRadius: 10 }} name="topic" defaultValue={defaultTopic} required>{topics.map(topic => <option key={topic} value={topic}>{topic}</option>)}</select></label>
      <label style={{ display: "grid", gap: 6 }}>Message <textarea style={{ width: "100%", padding: 12, borderRadius: 10 }} name="message" rows={4} minLength={10} maxLength={3000} required /></label>
      <label hidden aria-hidden="true">Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      <button className="secondary-button" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send Message"}</button>
      {state === "sent" ? <p role="status">Your message was sent to support. We'll review it as soon as possible.</p> : null}
      {state === "error" ? <p role="alert">We couldn't deliver your message. Please try again later.</p> : null}
      <p className="microcopy">Do not send passwords or payment-card information. A support request does not automatically cancel a subscription. To cancel renewal, use <a href="/manage-subscription">Manage Subscription</a>.</p>
    </form>
  );
}
