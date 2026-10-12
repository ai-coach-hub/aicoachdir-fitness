import { stripeRequest, stripeSubscriptionIsActive } from "@/lib/stripeServer";

type StripeRecord = Record<string, unknown>;

export function stripeRecord(value: unknown): StripeRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as StripeRecord
    : {};
}

export function billingEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function stripeId(value: unknown, prefix: "cus" | "sub") {
  const id = String(value || "");
  return new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(id) ? id : "";
}

export type SubscriptionState =
  | "active"
  | "canceling"
  | "recoverable"
  | "canceled"
  | "unknown";

export function classifyStripeSubscription(value: unknown): SubscriptionState {
  const subscription = stripeRecord(value);
  const status = String(subscription.status || "");
  if (stripeSubscriptionIsActive(status)) {
    return subscription.cancel_at_period_end === true || !!subscription.cancel_at
      ? "canceling" : "active";
  }
  if (["past_due", "unpaid", "incomplete", "paused"].includes(status)) {
    return "recoverable";
  }
  if (["canceled", "incomplete_expired"].includes(status)) {
    return "canceled";
  }
  return "unknown";
}

async function listAllSubscriptions(customerId: string) {
  const results: StripeRecord[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ customer: customerId, status: "all", limit: "100" });
    if (cursor) query.set("starting_after", cursor);
    const result = await stripeRequest(`/subscriptions?${query.toString()}`);
    const items = Array.isArray(result.data) ? result.data.map(stripeRecord) : [];
    results.push(...items);
    if (result.has_more !== true) return results;
    cursor = String(items[items.length - 1]?.id || "");
    if (!cursor) throw new Error("Subscription list pagination is incomplete.");
  }
  throw new Error("Subscription list exceeded the safe verification limit.");
}

export async function getVerifiedSubscription(args: {
  customerId: string;
  subscriptionId: string;
  memberEmail: string;
}) {
  const customerId = stripeId(args.customerId, "cus");
  const subscriptionId = stripeId(args.subscriptionId, "sub");
  if (!customerId || !subscriptionId) return null;

  const customer = await stripeRequest(`/customers/${encodeURIComponent(customerId)}`);
  if (customer.deleted === true || billingEmail(customer.email) !== billingEmail(args.memberEmail)) {
    throw new Error("The stored billing customer does not match this verified member.");
  }

  const subscription = await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (String(subscription.customer || "") !== customerId) {
    throw new Error("The saved subscription belongs to a different Stripe customer.");
  }
  return {
    customerId,
    subscriptionId,
    status: String(subscription.status || ""),
    state: classifyStripeSubscription(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    cancelAt: subscription.cancel_at || null,
  };
}

export type CheckoutRisk =
  | { kind: "clear"; customerId: string }
  | { kind: "active"; customerId: string; subscriptionId: string }
  | { kind: "recoverable"; customerId: string; subscriptionId: string };

// A signed-in customer can own several historical Stripe customer records.
// Never create a second paid subscription if ANY exact-email customer has an
// active or recoverable subscription. Email matching blocks duplicate billing;
// it is NOT used to grant account access or expose the Stripe billing portal.
export async function checkCheckoutRisk(
  email: string,
  storedCustomerId: string,
): Promise<CheckoutRisk> {
  const target = billingEmail(email);
  if (!target) throw new Error("Member email is required.");
  const listed = await stripeRequest(
    `/customers?${new URLSearchParams({ email: target, limit: "100" }).toString()}`,
  );
  if (listed.has_more === true) {
    throw new Error("Customer lookup exceeded the safe verification limit.");
  }

  const customers = (Array.isArray(listed.data) ? listed.data : [])
    .map(stripeRecord)
    .filter((customer) =>
      customer.deleted !== true && billingEmail(customer.email) === target,
    );

  const saved = stripeId(storedCustomerId, "cus");
  if (saved && !customers.some((customer) => customer.id === saved)) {
    // An existing link is authoritative, but must still match this member.
    const customer = await stripeRequest(`/customers/${encodeURIComponent(saved)}`);
    if (customer.deleted === true || billingEmail(customer.email) !== target) {
      throw new Error("The saved billing customer must be verified before checkout.");
    }
    customers.unshift(customer);
  }

  let recoverable: CheckoutRisk | null = null;
  for (const customer of customers) {
    const customerId = stripeId(customer.id, "cus");
    if (!customerId) continue;
    const subscriptions = await listAllSubscriptions(customerId);
    for (const subscription of subscriptions) {
      const subscriptionId = stripeId(subscription.id, "sub");
      if (!subscriptionId) continue;
      const state = classifyStripeSubscription(subscription);
      if (state === "active" || state === "canceling") {
        return { kind: "active", customerId, subscriptionId };
      }
      if (state === "recoverable") {
        recoverable = { kind: "recoverable", customerId, subscriptionId };
      }
      if (state === "unknown") {
        // Unknown billing states are not safe to charge again.
        throw new Error("An unresolved subscription status needs billing review.");
      }
    }
  }
  // Reuse one uniquely verified historical billing customer on a return
  // instead of creating a second Stripe customer with the same login.
  const priorCustomerId = customers.length === 1
    ? stripeId(customers[0].id, "cus") : "";
  return recoverable || { kind: "clear", customerId: saved || priorCustomerId };
}
