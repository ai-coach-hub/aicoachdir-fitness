// Pure subscription-change planning. No Stripe or database side effects.
// The caller must use server-authoritative price IDs and verified membership.
const TIERS = Object.freeze({
  starter: { monthlyCents: 900, monthlyMessages: 100 },
  growth: { monthlyCents: 1500, monthlyMessages: 200 },
  premium: { monthlyCents: 2500, monthlyMessages: 400 },
  elite: { monthlyCents: 3500, monthlyMessages: 600 },
});
const SAFE_STATUSES = new Set(["active", "trialing"]);

export function planSubscriptionChange(input) {
  const subscription = input?.subscription;
  const targetTier = String(input?.targetTier || "").toLowerCase();
  const target = TIERS[targetTier];
  if (!target) return { ok: false, reason: "unapproved_tier" };
  if (!input?.verifiedClerkUserId || !input?.linkedClerkUserId ||
      input.verifiedClerkUserId !== input.linkedClerkUserId) {
    return { ok: false, reason: "identity_mismatch" };
  }
  if (!input?.verifiedCustomerId || input.verifiedCustomerId !== subscription?.customer ||
      !input?.linkedSubscriptionId || input.linkedSubscriptionId !== subscription?.id) {
    return { ok: false, reason: "subscription_mismatch" };
  }
  if (!SAFE_STATUSES.has(subscription.status) || subscription.cancel_at_period_end ||
      subscription.cancel_at || subscription.pending_update || subscription.schedule) {
    return { ok: false, reason: "subscription_not_changeable" };
  }
  const items = subscription?.items?.data;
  if (!Array.isArray(items) || items.length !== 1 || items[0]?.quantity !== 1 ||
      !items[0]?.id || !items[0]?.price?.id) {
    return { ok: false, reason: "unsupported_subscription_items" };
  }
  if (input?.otherActiveSubscriptionCount !== 0) {
    return { ok: false, reason: "multiple_or_unverified_subscriptions" };
  }
  const priceMap = input?.approvedPriceIds;
  if (!priceMap || !Object.values(TIERS).every(Boolean) ||
      Object.keys(TIERS).some(tier => !/^price_[A-Za-z0-9]+$/.test(priceMap[tier] || "")) ||
      new Set(Object.values(priceMap).filter(Boolean)).size !== Object.keys(TIERS).length) {
    return { ok: false, reason: "price_mapping_incomplete" };
  }
  if (!input?.sharedAllowanceReady) return { ok: false, reason: "shared_allowance_not_ready" };
  const currentPriceId = items[0].price.id;
  const currentTier = Object.keys(TIERS).find(tier => priceMap[tier] === currentPriceId);
  if (!currentTier) return { ok: false, reason: "legacy_plan_requires_explicit_choice" };
  if (currentTier === targetTier) return { ok: true, action: "no_change", currentTier, targetTier };
  const direction = target.monthlyCents > TIERS[currentTier].monthlyCents ? "upgrade" : "downgrade";
  return {
    ok: true, action: direction, currentTier, targetTier,
    subscriptionId: subscription.id, subscriptionItemId: items[0].id,
    targetPriceId: priceMap[targetTier],
    // Upgrades are paid and provisioned only after confirmed successful invoice/payment.
    // Downgrades retain paid benefits until the end of the existing billing period.
    effective: direction === "upgrade" ? "after_successful_prorated_payment" : "next_billing_period",
    requiresBillingPreview: direction === "upgrade",
    requiresSchedule: direction === "downgrade",
    requiresPaymentConfirmation: direction === "upgrade",
  };
}

export { TIERS };
