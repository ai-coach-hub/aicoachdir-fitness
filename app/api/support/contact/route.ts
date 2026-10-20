import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const supportInbox = "Ai.coach.hub.domain@gmail.com";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 9000) return NextResponse.json({ error: "Message too long" }, { status: 413 });
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid");
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }
  if (input.website) return NextResponse.json({ ok: true });
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim();
  const message = String(input.message || "").trim();
  if (!name || name.length > 120 || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      message.length < 10 || message.length > 3000) {
    return NextResponse.json({ error: "Invalid contact details" }, { status: 400 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SUPPORT_CONTACT_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json({ error: "Contact delivery not yet configured" }, { status: 503 });
  }
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [supportInbox],
        reply_to: email,
        subject: "AI Coach Directory - Subscription support request",
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\nSubmission does not automatically cancel billing.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) {
      console.error("[support-contact] delivery failed", result.status);
      return NextResponse.json({ error: "Delivery unavailable" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[support-contact] transport failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Delivery unavailable" }, { status: 502 });
  }
}
