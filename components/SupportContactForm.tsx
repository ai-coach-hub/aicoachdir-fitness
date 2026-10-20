"use client";
import { useState, type FormEvent } from "react";

export default function SupportContactForm() {
  const [state, setState] = useState("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("sending");
    try {
      const response = await fetch("/api/support/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), email: data.get("email"), message: data.get("message"), website: data.get("website") }),
      });
      if (!response.ok) throw Error("Could not deliver your message.");
      form.reset();
      setState("sent");
    } catch {
      setState("error");
    }
  }
  return (
    <form onSubmit={submit} className="support-contact-form">
      <label>Name <input name="name" autoComplete="name" maxLength={120} required /></label>
      <label>Email <input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Message <textarea name="message" rows={4} minLength={10} maxLength={3000} required /></label>
      <label className="support-contact-trap" aria-hidden="true">Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      <button className="secondary-button" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send Message"}</button>
      {state === "sent" ? <p role="status">Your message was sent to support. This request does not automatically cancel a subscription.</p> : null}
      {state === "error" ? <p role="alert">We couldn't deliver your message. Please try again later.</p> : null}
      <p className="microcopy">Do not send passwords or payment-card information. This form does not automatically cancel your subscription.</p>
    </form>
  );
}
