import { getPickaxeUser, FITNESS_ACCESS_GROUP_ID } from "@/lib/pickaxeAccess";
import { stripeRequest } from "@/lib/stripeServer";
import { billingEmail, classifyStripeSubscription, stripeRecord } from "@/lib/stripeMembershipState";

const PICKAXE_STUDIO_ID = "STUDIOFEB9DXAKH9BA0QAXYBA6";

export type VerifiedHistoricalBilling = {
  customerId: string;
  subscriptionId: string;
  status: string;
  active: boolean;
};

function pickaxeMemberId(value: unknown, expectedEmail: string) {
  const user = stripeRecord(value);
  if (billingEmail(user.email) !== expectedEmail) return "";
  return [user.id, user.userId, user._id, user.studioUserId]
    .map((id) => String(id || "").trim())
    .find((id) => /^USER[A-Z0-9]+$/.test(id)) || "";
}

async function historicalSubscriptions(userId: string) {
  const matches: Record<string, unknown>[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ status: "all", limit: "100" });
    if (cursor) query.set("starting_after", cursor);
    const response = await stripeRequest(`/subscriptions?${query.toString()}`);
    const values = Array.isArray(response.data) ? response.data.map(stripeRecord) : [];
    for (const subscription of values) {
      const metadata = stripeRecord(subscription.metadata);
      let products: unknown = [];
      try { products = JSON.parse(String(metadata.productIds || "[]")); } catch {
        products = [];
      }
      if (String(metadata.studioId || "") === PICKAXE_STUDIO_ID &&
          String(metadata.studioUserId || "") === userId &&
          Array.isArray(products) &&
          products.includes(FITNESS_ACCESS_GROUP_ID)) {
        matches.push(subscription);
      }
    }
    if (response.has_more !== true) return matches;
    cursor = String(values[values.length - 1]?.id || "");
    if (!cursor) throw new Error("Historical billing pagination was incomplete.");
  }
  throw new Error("Historical billing exceeded the safe verification limit.");
}

export async function discoverVerifiedHistoricalBilling(email: string) {
  const memberEmail = billingEmail(email);
  if (!memberEmail) return null;
  const identity = pickaxeMemberId(
    await getPickaxeUser(memberEmail, { fallbackToList: false }),
    memberEmail,
  );
  if (!identity) return null;
  const candidates = await historicalSubscriptions(identity);
  const verified: (VerifiedHistoricalBilling & { created: number })[] = [];

  for (const subscription of candidates) {
    const customerId = String(subscription.customer || "");
    const subscriptionId = String(subscription.id || "");
    if (!/^cus_[A-Za-z0-9]+$/.test(customerId) ||
        !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) continue;
    const customer = await stripeRequest(`/customers/${encodeURIComponent(customerId)}`);
    if (customer.deleted === true || billingEmail(customer.email) !== memberEmail) continue;
    const state = classifyStripeSubscription(subscription);
    if (state === "unknown") {
      throw new Error("Unknown historical Stripe subscription status.");
    }
    verified.push({
      customerId,
      subscriptionId,
      status: String(subscription.status || ""),
      active: state === "active" || state === "canceling",
      created: Number(subscription.created || 0),
    });
  }
  if (verified.length === 0) return null;

  const outstanding = verified.filter((item) => item.active ||
    ["past_due", "unpaid", "incomplete", "paused"].includes(item.status));
  if (outstanding.length > 1) {
    // Multiple live billing obligations are not safe to auto-link.
    throw new Error("Multiple historical paid subscriptions need account review.");
  }
  const selected = (outstanding.length ? outstanding : verified)
    .sort((a, b) => b.created - a.created)[0];
  return selected || null;
}
