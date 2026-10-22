// Preview preparation: bridges trusted billing facts to the pure quota policy.
// No route imports this module. Inject an authoritative server-only billing
// reader and prior-period ledger reader; never take either from a client request.
import {
  decideSharedAiUsage,
  type SharedAiCoach,
  type PriorUsagePeriod,
  type SharedUsageDecision,
  type StripeUsageState,
} from "./sharedAiEntitlementPolicy";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";

export type TrustedMemberBinding = {
  clerkUserId: string;
  verifiedPrimaryEmail: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  approvedPriceId: string;
  approvedLedgerKey: string;
  includedUses: number;
  allowedCoaches: readonly SharedAiCoach[];
};

type BillingLookup = (binding: TrustedMemberBinding) => Promise<{
  verifiedCustomerEmail: string;
  verifiedAt: string;
  subscription: unknown;
} | null>;

export async function checkVerifiedSharedUsage(
  binding: TrustedMemberBinding,
  request: {authenticatedClerkUserId:string; coach:SharedAiCoach; requestKey:string; now:string},
  dependencies: {
    lookupBilling: BillingLookup;
    lookupPriorPeriod: (clerkUserId:string) => Promise<PriorUsagePeriod | null>;
  }
): Promise<SharedUsageDecision> {
  const deny = (reason: Extract<SharedUsageDecision,{allowed:false}>["reason"]) =>
    ({allowed:false as const,reason});
  if (binding.clerkUserId !== request.authenticatedClerkUserId ||
      !/^user_[A-Za-z0-9_-]{8,128}$/.test(request.authenticatedClerkUserId))
    return deny("invalid_identity");
  if (!binding.verifiedPrimaryEmail || binding.verifiedPrimaryEmail.trim() !==
        binding.verifiedPrimaryEmail.toLowerCase())
    return deny("invalid_identity");
  if (!/^price_[A-Za-z0-9]+$/.test(binding.approvedPriceId) ||
      !/^[A-Za-z0-9_-]{4,128}$/.test(binding.approvedLedgerKey))
    return deny("unapproved_entitlement");
  try {
    const billing = await dependencies.lookupBilling(binding);
    if (!billing || billing.verifiedCustomerEmail.trim().toLowerCase() !==
        binding.verifiedPrimaryEmail)
      return deny("billing_unverified");
    const raw = billing.subscription;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return deny("billing_unverified");
    const sub = raw as Record<string,unknown>;
    if (typeof sub.status !== "string") return deny("billing_unverified");
    const window = stripeUsageWindowFromVerifiedRecord(sub,{
      customerId:binding.stripeCustomerId,
      subscriptionId:binding.stripeSubscriptionId,
      priceId:binding.approvedPriceId,
    });
    if (!window.ok) return deny("billing_unverified");
    // The ledger must be inspected before authorizing a possible new period.
    // Missing/unavailable ledger reads fail closed, never mean zero uses.
    const priorPeriod = await dependencies.lookupPriorPeriod(binding.clerkUserId);
    return decideSharedAiUsage({
      clerkUserId:binding.clerkUserId,
      stripeCustomerId:binding.stripeCustomerId,
      stripeSubscriptionId:binding.stripeSubscriptionId,
      stripeStatus:sub.status as StripeUsageState,
      cancelAtPeriodEnd:sub.cancel_at_period_end === true,
      verifiedAt:billing.verifiedAt,
      periodStart:window.periodStart,
      periodEnd:window.periodEnd,
      allowanceLedgerKey:binding.approvedLedgerKey,
      includedUses:binding.includedUses,
      allowedCoaches:binding.allowedCoaches,
    }, {...request,priorPeriod});
  } catch {
    return deny("billing_unverified");
  }
}
