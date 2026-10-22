// Pure, offline-testable membership-to-AI-allowance policy.
// PREPARATION ONLY: no production route imports this module; no Stripe calls,
// database writes, plan prices, or membership mutations are performed here.
// Callers must supply a recently verified server-side subscription snapshot,
// authenticated Clerk ID and a stable per-member allowance ledger family.
export type SharedAiCoach = "fitness" | "budgeting" | "life" | "career";
export type StripeUsageState =
  | "active" | "trialing" | "past_due" | "unpaid" | "paused"
  | "canceled" | "incomplete" | "incomplete_expired";

export type VerifiedUsageSnapshot = {
  clerkUserId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeStatus: StripeUsageState;
  cancelAtPeriodEnd: boolean;
  verifiedAt: string;
  periodStart: string;
  periodEnd: string;
  // Issued from an explicitly approved, server-side entitlement mapping.
  // Stable through reactivation and plan changes within a billing period.
  allowanceLedgerKey: string;
  includedUses: number;
  allowedCoaches: readonly SharedAiCoach[];
};

export type PriorUsagePeriod = {
  clerkUserId: string;
  allowanceLedgerKey: string;
  includedUses: number;
  periodStart: string;
  periodEnd: string;
};

export type SharedUsageDecision =
  | {
      allowed: true;
      memberId: string;
      subscriptionKey: string;
      periodStart: string;
      periodEnd: string;
      limitUses: number;
      coach: SharedAiCoach;
      requestKey: string;
    }
  | {
      allowed: false;
      reason: "invalid_identity" | "unapproved_entitlement" |
        "billing_unverified" | "subscription_inactive" |
        "outside_billing_period" | "overlapping_period" | "coach_not_included" |
        "allowance_change_requires_review";
    };

const isoUtc = (value: unknown): number | null => {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
};
const ledgerId = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(value);
const stripeId = (value: unknown, prefix: string) =>
  typeof value === "string" && new RegExp("^" + prefix + "_[A-Za-z0-9]+$").test(value);

export function decideSharedAiUsage(
  snapshot: VerifiedUsageSnapshot,
  request: {
    authenticatedClerkUserId: string;
    coach: SharedAiCoach;
    requestKey: string;
    now: string;
    priorPeriod?: PriorUsagePeriod | null;
  },
): SharedUsageDecision {
  const denied = (reason: Extract<SharedUsageDecision, {allowed:false}>["reason"]) =>
    ({allowed:false as const, reason});

  if (!ledgerId(request.authenticatedClerkUserId) ||
      !ledgerId(snapshot.clerkUserId) ||
      snapshot.clerkUserId !== request.authenticatedClerkUserId ||
      !stripeId(snapshot.stripeCustomerId, "cus") ||
      !stripeId(snapshot.stripeSubscriptionId, "sub") ||
      typeof request.requestKey !== "string" ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(request.requestKey))
    return denied("invalid_identity");

  // No implicit entitlement for today's $15 plan or unreleased coaches.
  // The approved plan and allowed coaches must be explicitly supplied.
  if (!ledgerId(snapshot.allowanceLedgerKey) ||
      !Number.isSafeInteger(snapshot.includedUses) ||
      snapshot.includedUses < 1 || snapshot.includedUses > 10000 ||
      !Array.isArray(snapshot.allowedCoaches) ||
      !snapshot.allowedCoaches.length ||
      snapshot.allowedCoaches.some(x => !["fitness","budgeting","life","career"].includes(x)))
    return denied("unapproved_entitlement");

  const now = isoUtc(request.now);
  const checked = isoUtc(snapshot.verifiedAt);
  const start = isoUtc(snapshot.periodStart);
  const end = isoUtc(snapshot.periodEnd);
  // Stale, future, malformed or missing billing-period verification fails
  // closed. The verification must originate from the server, not the browser.
  if (now === null || checked === null || start === null || end === null ||
      checked > now + 60_000 || now - checked > 15 * 60_000 ||
      end <= start || end - start > 35 * 24 * 60 * 60_000)
    return denied("billing_unverified");

  // cancel_at_period_end leaves the raw Stripe status 'active' until the
  // current paid period ends. Past_due/canceled must not mint new AI uses.
  if (snapshot.stripeStatus !== "active" && snapshot.stripeStatus !== "trialing")
    return denied("subscription_inactive");
  if (now < start || now >= end) return denied("outside_billing_period");
  if (!snapshot.allowedCoaches.includes(request.coach))
    return denied("coach_not_included");

  const prior = request.priorPeriod;
  if (prior) {
    if (prior.clerkUserId !== snapshot.clerkUserId)
      return denied("invalid_identity");
    const oldStart = isoUtc(prior.periodStart);
    const oldEnd = isoUtc(prior.periodEnd);
    if (oldStart === null || oldEnd === null || oldEnd <= oldStart ||
        !ledgerId(prior.allowanceLedgerKey) ||
        !Number.isSafeInteger(prior.includedUses) || prior.includedUses < 1)
      return denied("billing_unverified");
    if (prior.periodStart === snapshot.periodStart &&
        prior.includedUses !== snapshot.includedUses)
      return denied("allowance_change_requires_review");
    // A new Stripe subscription, tier or ledger key cannot mint a second
    // allowance while the prior billing period is still running.
    if ((prior.periodStart !== snapshot.periodStart ||
         prior.allowanceLedgerKey !== snapshot.allowanceLedgerKey) &&
        start < oldEnd)
      return denied("overlapping_period");
  }

  // Same Clerk identity + stable allowance family + exact period prevents a
  // fresh allowance solely because the Stripe subscription ID was replaced.
  return {
    allowed:true,
    memberId:snapshot.clerkUserId,
    subscriptionKey:snapshot.allowanceLedgerKey,
    periodStart:snapshot.periodStart,
    periodEnd:snapshot.periodEnd,
    limitUses:snapshot.includedUses,
    coach:request.coach,
    requestKey:request.requestKey,
  };
}
