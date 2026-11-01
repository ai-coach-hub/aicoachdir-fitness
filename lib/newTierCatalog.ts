/**
 * New member tier catalog. Existing grandfathered subscriptions are never
 * mapped to these prices. Customer plan selection is always server verified.
 */
export const publicTiers = [
  { tier: "starter", cents: 900, messages: 100 },
  { tier: "growth", cents: 1500, messages: 200 },
  { tier: "premium", cents: 2500, messages: 400 },
  { tier: "elite", cents: 3500, messages: 600 },
] as const;
export type PublicTier = typeof publicTiers[number]["tier"];
const identifier = (v: unknown) => typeof v === "string" && /^price_[A-Za-z0-9]+$/.test(v);
export function newTierSignupsEnabled() {
  return process.env.VERCEL_ENV === "production" &&
    process.env.LIVE_NEW_TIER_SIGNUPS_ENABLED === "true";
}
export function approvedLiveTierCatalog(): Record<PublicTier,string> {
  if (process.env.VERCEL_ENV !== "production") throw Error("Live tiers require production");
  let parsed: Record<string,unknown>;
  try { parsed = JSON.parse(process.env.LIVE_FOUR_TIER_PRICE_CATALOG || "{}"); }
  catch { throw Error("Tier catalog invalid"); }
  if (Object.keys(parsed).length !== 4 ||
      publicTiers.some(t => !identifier(parsed[t.tier])) ||
      new Set(Object.values(parsed)).size !== 4)
    throw Error("Tier catalog incomplete");
  return parsed as Record<PublicTier,string>;
}
export async function checkedNewTierPrice(
  selected: unknown,
  stripe: (path: string) => Promise<Record<string,unknown>>,
) {
  const t = publicTiers.find(t => t.tier === selected);
  if (!t) throw Error("Choose a valid membership plan");
  if (!newTierSignupsEnabled()) throw Error("New membership plans are not released");
  const account = await stripe("/account");
  if (!process.env.TIER_STRIPE_ACCOUNT_ID || account.id !== process.env.TIER_STRIPE_ACCOUNT_ID)
    throw Error("Stripe account mismatch");
  const id = approvedLiveTierCatalog()[t.tier];
  const price = await stripe("/prices/" + encodeURIComponent(id));
  const recurring = price.recurring as Record<string,unknown> | undefined;
  if (price.id !== id || price.livemode !== true || price.active !== true ||
      price.currency !== "usd" || price.unit_amount !== t.cents ||
      price.type !== "recurring" || recurring?.interval !== "month" ||
      recurring?.interval_count !== 1 || recurring?.usage_type !== "licensed")
    throw Error("Membership plan price did not verify");
  return {...t,priceId:id};
}
