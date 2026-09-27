import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getBillingConfig,
  setBillingConfig,
} from "@/lib/stripeConfigDb";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const PLAN_NAME = "AI Fitness Coach 2.0";
const MONTHLY_AMOUNT_CENTS = 1500;
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

export const FITNESS_PRICE_DOLLARS = 15;
export const FITNESS_INCLUDED_USES = 400;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function secretKey() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new Error("Stripe secret key is not configured.");
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

function records(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const data = (value as Record<string, unknown>).data;
  return Array.isArray(data)
    ? data.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function isMonthlyFitnessPrice(price: Record<string, unknown>) {
  const recurring =
    price.recurring && typeof price.recurring === "object" && !Array.isArray(price.recurring)
      ? (price.recurring as Record<string, unknown>)
      : {};
  return (
    price.active === true &&
    Number(price.unit_amount) === MONTHLY_AMOUNT_CENTS &&
    String(price.currency || "").toLowerCase() === "usd" &&
    String(recurring.interval || "") === "month" &&
    Number(recurring.interval_count || 1) === 1
  );
}

export async function ensureFitnessPriceId() {
  const configured = process.env.STRIPE_FITNESS_PRICE_ID?.trim();
  if (configured) return configured;

  const stored = await getBillingConfig("stripe_fitness_price_id");
  if (stored) return stored;

  const productList = await stripeRequest("/products?active=true&limit=100");
  const products = records(productList);
  let product = products.find((item) => String(item.name || "") === PLAN_NAME);

  if (!product) {
    const body = new URLSearchParams();
    body.set("name", PLAN_NAME);
    body.set("description", "AI Fitness Coach 2.0 membership");
    body.set("metadata[aicoachdir_plan]", "fitness_v2");
    product = await stripeRequest("/products", { method: "POST", body });
  }

  const productId = String(product.id || "");
  if (!productId) throw new Error("Stripe Fitness product could not be resolved.");

  const priceList = await stripeRequest(
    `/prices?active=true&type=recurring&limit=100&product=${encodeURIComponent(productId)}`,
  );
  let price = records(priceList).find(isMonthlyFitnessPrice);

  if (!price) {
    const body = new URLSearchParams();
    body.set("product", productId);
    body.set("currency", "usd");
    body.set("unit_amount", String(MONTHLY_AMOUNT_CENTS));
    body.set("recurring[interval]", "month");
    body.set("recurring[interval_count]", "1");
    body.set("nickname", "AI Fitness Coach 2.0 - Monthly");
    body.set("metadata[aicoachdir_plan]", "fitness_v2");
    price = await stripeRequest("/prices", { method: "POST", body });
  }

  const priceId = String(price.id || "");
  if (!priceId) throw new Error("Stripe Fitness price could not be resolved.");

  await setBillingConfig("stripe_fitness_price_id", priceId);
  return priceId;
}

function webhookConfigKey(origin: string) {
  return `stripe_webhook_secret:${origin}`;
}

export async function ensureWebhookSecret(origin: string) {
  const envSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (envSecret) return envSecret;

  const key = webhookConfigKey(origin);
  const stored = await getBillingConfig(key);
  if (stored) return stored;

  const webhookUrl = `${origin}/api/billing/webhook`;
  const list = await stripeRequest("/webhook_endpoints?limit=100");
  const existing = records(list).find(
    (item) => String(item.url || "") === webhookUrl && item.status !== "disabled",
  );

  if (existing) {
    throw new Error(
      "A Stripe webhook already exists for this URL but its signing secret is not stored. Set STRIPE_WEBHOOK_SECRET once to adopt it.",
    );
  }

  const body = new URLSearchParams();
  body.set("url", webhookUrl);
  body.set("description", "AI Coach Directory Fitness membership access");
  WEBHOOK_EVENTS.forEach((event) => body.append("enabled_events[]", event));

  const endpoint = await stripeRequest("/webhook_endpoints", {
    method: "POST",
    body,
  });
  const secret = String(endpoint.secret || "");
  if (!secret) throw new Error("Stripe did not return a webhook signing secret.");

  await setBillingConfig(key, secret);
  return secret;
}

export async function ensureStripeBillingResources(origin: string) {
  const [priceId] = await Promise.all([
    ensureFitnessPriceId(),
    ensureWebhookSecret(origin),
  ]);
  return { priceId };
}

export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
  origin: string,
) {
  const secret =
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    (await getBillingConfig(webhookConfigKey(origin)));
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
