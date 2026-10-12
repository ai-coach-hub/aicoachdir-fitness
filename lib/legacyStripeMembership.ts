import { canonicalMemberEmail } from "@/lib/memberIdentity";
import { getFitnessMembership, linkLegacyFitnessMembershipBilling } from "@/lib/fitnessMembershipDb";
import { FITNESS_ACCESS_GROUP_ID, getPickaxeUser } from "@/lib/pickaxeAccess";
import { stripeConfigured, stripeRequest, stripeSubscriptionIsActive } from "@/lib/stripeServer";

// These are the verified identifiers on the historical Pickaxe-created
// subscriptions in the connected Stripe account. New site checkouts use
// Clerk metadata and must not be reconciled through this legacy path.
const LEGACY_PICKAXE_STUDIO_ID = "STUDIOFEB9DXAKH9BA0QAXYBA6";

type StripeRecord = Record<string, unknown>;

function record(value: unknown): StripeRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as StripeRecord
    : {};
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function legacyProductIncludesFitness(metadata: StripeRecord) {
  try {
    const ids = JSON.parse(String(metadata.productIds || "[]"));
    return Array.isArray(ids) && ids.includes(FITNESS_ACCESS_GROUP_ID);
  } catch {
    return false;
  }
}

function pickaxeIdentity(value: unknown, email: string) {
  const user = record(value);
  if (normalizeEmail(user.email) !== email) return "";
  const ids = [user.id, user.userId, user._id, user.studioUserId];
  return ids
    .map((item) => String(item || "").trim())
    .find((item) => /^USER[A-Z0-9]+$/.test(item)) || "";
}

async function activeLegacySubscriptions(userId: string) {
  const matches: StripeRecord[] = [];
  for (const status of ["active", "trialing"]) {
    let cursor = "";
    for (let page = 0; page < 12; page += 1) {
      const params = new URLSearchParams({ status, limit: "100" });
      if (cursor) params.set("starting_after", cursor);
      const result = await stripeRequest(`/subscriptions?${params.toString()}`);
      const subscriptions = Array.isArray(result.data) ? result.data : [];

      for (const item of subscriptions) {
        const subscription = record(item);
        const metadata = record(subscription.metadata);
        if (
          String(metadata.studioId || "") === LEGACY_PICKAXE_STUDIO_ID &&
          String(metadata.studioUserId || "") === userId &&
          legacyProductIncludesFitness(metadata) &&
          stripeSubscriptionIsActive(subscription.status)
        ) {
          matches.push(subscription);
        }
      }

      if (result.has_more !== true) break;
      const last = record(subscriptions[subscriptions.length - 1]);
      cursor = String(last.id || "");
      if (!cursor || page === 11) {
        throw new Error("Unable to complete legacy subscription verification.");
      }
    }
  }
  return matches;
}

/**
 * Only called for a signed-in Clerk user whose primary email is verified.
 * Link a live subscription when both:
 *   1. The Pickaxe Studio user ID matches the legacy Stripe subscription ID.
 *   2. The independent Stripe customer email matches the signed-in email.
 *
 * Never link canceled subscriptions or overwrite an existing billing link.
 */
export async function linkVerifiedLegacyStripeMembership(
  email: string,
  clerkUserId: string,
) {
  const memberEmail = canonicalMemberEmail(email);
  if (!memberEmail || !clerkUserId) return null;

  const existing = await getFitnessMembership(memberEmail);
  if (
    !existing ||
    existing.access_active !== true ||
    existing.stripe_status !== "legacy_pickaxe_member" ||
    existing.stripe_customer_id ||
    existing.stripe_subscription_id ||
    String(existing.clerk_user_id || "") !== clerkUserId ||
    !stripeConfigured()
  ) {
    return existing;
  }

  const studioUserId = pickaxeIdentity(await getPickaxeUser(memberEmail), memberEmail);
  if (!studioUserId) return existing;

  const matches = await activeLegacySubscriptions(studioUserId);
  if (matches.length === 0) return existing;
  if (matches.length !== 1) {
    throw new Error("Multiple live legacy subscriptions match this member.");
  }

  const subscription = matches[0];
  const subscriptionId = String(subscription.id || "");
  const customerId = String(subscription.customer || "");
  if (
    !/^sub_[A-Za-z0-9]+$/.test(subscriptionId) ||
    !/^cus_[A-Za-z0-9]+$/.test(customerId)
  ) return existing;

  const customer = await stripeRequest(`/customers/${encodeURIComponent(customerId)}`);
  if (customer.deleted === true || normalizeEmail(customer.email) !== memberEmail) {
    return existing;
  }

  const linked = await linkLegacyFitnessMembershipBilling({
    email: memberEmail,
    clerkUserId,
    customerId,
    subscriptionId,
    stripeStatus: String(subscription.status || ""),
  });

  return linked || await getFitnessMembership(memberEmail);
}
