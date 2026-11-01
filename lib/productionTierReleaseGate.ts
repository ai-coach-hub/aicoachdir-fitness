/**
 * Production tier-release validation. Side-effect free: never creates Stripe prices,
 * changes existing subscriptions, or grants member wallets.
 *
 * A legacy $15/400 membership is deliberately NOT mapped to Growth ($15/200).
 */
export type LiveTier = "starter" | "growth" | "premium" | "elite";
export type LivePriceRecord = {
  id: string; active: boolean; livemode: boolean; currency: string;
  unit_amount: number | null; type: string;
  recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null;
};
export type LiveTierAssignment = { tier: LiveTier; priceId: string };
export type ReleaseDecision =
  | { ok: true; catalog: ReadonlyArray<{ tier: LiveTier; priceId: string; amountCents: number; messages: number }> }
  | { ok: false; reasons: string[] };

const targets = [
  { tier: "starter", amountCents: 900, messages: 100 },
  { tier: "growth", amountCents: 1500, messages: 200 },
  { tier: "premium", amountCents: 2500, messages: 400 },
  { tier: "elite", amountCents: 3500, messages: 600 },
] as const;

export function verifyLiveTierRelease(input: {
  enabled: boolean;
  assignments: readonly LiveTierAssignment[];
  stripePrices: readonly LivePriceRecord[];
  legacyPriceIds: readonly string[];
  productionBranchId: string;
  actualDatabaseBranchId: string;
  reconciledWalletPeriods: boolean;
  signedInvoiceWebhookReady: boolean;
  downgradeRenewalHandlerReady: boolean;
}): ReleaseDecision {
  const reasons: string[] = [];
  if (!input.enabled) reasons.push("release_switch_off");
  if (!input.productionBranchId || input.productionBranchId !== input.actualDatabaseBranchId)
    reasons.push("production_database_not_verified");
  if (!input.reconciledWalletPeriods) reasons.push("wallets_not_reconciled");
  if (!input.signedInvoiceWebhookReady) reasons.push("paid_invoice_webhook_missing");
  if (!input.downgradeRenewalHandlerReady) reasons.push("renewal_downgrade_not_ready");
  const tiers = new Set<string>(), ids = new Set<string>();
  const result: Array<{ tier: LiveTier; priceId: string; amountCents: number; messages: number }> = [];
  for (const target of targets) {
    const matches = input.assignments.filter(a => a.tier === target.tier);
    if (matches.length !== 1) {
      reasons.push("missing_or_duplicate_" + target.tier); continue;
    }
    const a = matches[0];
    if (!/^price_[A-Za-z0-9]+$/.test(a.priceId) || tiers.has(a.tier) || ids.has(a.priceId)) {
      reasons.push("duplicate_or_invalid_price"); continue;
    }
    tiers.add(a.tier); ids.add(a.priceId);
    if (input.legacyPriceIds.includes(a.priceId)) {
      reasons.push("grandfathered_price_reused"); continue;
    }
    const price = input.stripePrices.filter(p => p.id === a.priceId);
    if (price.length !== 1 || !price[0].livemode || !price[0].active ||
      price[0].currency !== "usd" || price[0].unit_amount !== target.amountCents ||
      price[0].type !== "recurring" || price[0].recurring?.interval !== "month" ||
      price[0].recurring?.interval_count !== 1 || price[0].recurring?.usage_type !== "licensed") {
      reasons.push("unapproved_live_" + target.tier); continue;
    }
    result.push({ tier: target.tier, priceId: a.priceId,
      amountCents: target.amountCents, messages: target.messages });
  }
  for (const a of input.assignments)
    if (!targets.some(t => t.tier === a.tier)) reasons.push("unknown_tier");
  return reasons.length ? { ok: false, reasons: [...new Set(reasons)] } : { ok: true, catalog: result };
}
