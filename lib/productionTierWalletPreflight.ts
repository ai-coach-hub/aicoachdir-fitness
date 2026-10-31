/**
 * Read-only preflight for an existing subscription's shared message wallet.
 * This must pass before an upgrade or downgrade is even prepared.
 * It does not create wallets or change billing. No email or Stripe IDs are logged.
 */
export type WalletPreflight = {
  verifiedMember: boolean;
  uniqueLinkedSubscription: boolean;
  activeSubscription: boolean;
  grandfatheredPlan: boolean;
  approvedCurrentPrice: boolean;
  stripePeriodStart: string;
  stripePeriodEnd: string;
  walletRows: ReadonlyArray<{
    periodStart: string;
    periodEnd: string;
    limit: number;
    completed: number;
    reserved: number;
  }>;
  nowMillis: number;
};
export type WalletPreflightResult =
  | { ok: true; remaining: number; allowance: number; periodEnd: string }
  | { ok: false; reason: string };
export function verifyWalletForTierChange(s: WalletPreflight): WalletPreflightResult {
  const fail=(reason:string):WalletPreflightResult=>({ok:false,reason});
  if(!s.verifiedMember||!s.uniqueLinkedSubscription)return fail("member_not_verified");
  if(!s.activeSubscription)return fail("subscription_not_active");
  // Grandfathered $15/400 customers keep their current terms until a separately
  // approved, explicit opt-in migration. Never silently classify as Growth.
  if(s.grandfatheredPlan)return fail("grandfathered_plan_requires_opt_in");
  if(!s.approvedCurrentPrice)return fail("current_price_not_approved");
  const start=Date.parse(s.stripePeriodStart),end=Date.parse(s.stripePeriodEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(s.nowMillis)||
     start>=end||s.nowMillis<start||s.nowMillis>=end)
    return fail("billing_period_invalid");
  if(s.walletRows.length!==1)return fail("wallet_missing_or_ambiguous");
  const w=s.walletRows[0];
  if(w.periodStart!==s.stripePeriodStart||w.periodEnd!==s.stripePeriodEnd)
    return fail("wallet_period_mismatch");
  const vals=[w.limit,w.completed,w.reserved];
  if(vals.some(n=>!Number.isSafeInteger(n)||n<0)||w.limit<1||
     w.completed+w.reserved>w.limit)
    return fail("wallet_counter_inconsistent");
  return {ok:true,remaining:w.limit-w.completed-w.reserved,allowance:w.limit,periodEnd:w.periodEnd};
}
