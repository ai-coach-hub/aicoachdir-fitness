const normalized = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validId = (value, prefix) => typeof value === 'string' && value.startsWith(prefix) && /^[a-zA-Z0-9_]+$/.test(value);

/** Refuse to link billing until both identity providers confirm ownership. Never mutates billing. */
export function resolveVerifiedBillingLink({email, clerkUserId, candidates, now = Math.floor(Date.now() / 1000)}) {
  const sought = normalized(email);
  if (!sought || typeof clerkUserId !== 'string' || !clerkUserId || !Array.isArray(candidates)) return {outcome:'unlinked'};
  const related = candidates.filter((c) => c && normalized(c.email) === sought);
  if (!related.length) return {outcome:'unlinked'};
  // Do not guess when multiple customers or subscriptions exist, including canceled ones.
  if (new Set(related.map((c) => c.customerId)).size !== 1 || new Set(related.map((c) => c.subscriptionId)).size !== 1) return {outcome:'ambiguous'};
  if (related.length !== 1) return {outcome:'ambiguous'};
  const c = related[0];
  const active = (c.status === 'active' || c.status === 'trialing') && (!c.cancelAtPeriodEnd || !(Number.isFinite(c.currentPeriodEnd) && now >= c.currentPeriodEnd));
  if (!active || !validId(c.customerId,'cus_') || !validId(c.subscriptionId,'sub_')) return {outcome:'unlinked'};
  const website = c.source === 'website' && c.verifiedClerkUserId === clerkUserId && c.clerkUserId === clerkUserId;
  const legacy = c.source === 'pickaxe' && c.clerkUserId === clerkUserId && normalized(c.verifiedPickaxeEmail) === sought && typeof c.pickaxeUserId === 'string' && c.pickaxeUserId.length > 0 && c.pickaxeUserId === c.stripeStudioUserId;
  if (!website && !legacy) return {outcome:'unlinked'};
  return {outcome:'linked',customerId:c.customerId,subscriptionId:c.subscriptionId,source:c.source};
}
