import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export const FITNESS_PRICE_DOLLARS = 15;
export const FITNESS_INCLUDED_USES = 400;

export function stripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_FITNESS_PRICE_ID?.trim()
  );
}

export function webhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

function secretKey() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new Error("Stripe secret key is not configured.");
  return value;
}

export function fitnessPriceId() {
  const value = process.env.STRIPE_FITNESS_PRICE_ID?.trim();
  if (!value) throw new Error("Fitness Stripe price is not configured.");
  return value;
}

export async function stripeRequest(
  path: string,
  init: { method?: "GET" | "POST"; body?: URLSearchParams } = {},
) {
  const method = init.method || "GET";
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(method === "POST" ? { body: init.body || new URLSearchParams() } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? String(
            ((payload as Record<string, unknown>).error as
              | Record<string, unknown>
              | undefined)?.message || "Stripe request failed.",
          )
        : "Stripe request failed.";
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

export function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((candidate) => {
    try {
      const actualBuffer = Buffer.from(candidate, "hex");
      return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      );
    } catch {
      return false;
    }
  });
}

export function stripeSubscriptionIsActive(status: unknown) {
  return status === "active" || status === "trialing";
}
