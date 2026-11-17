/**
 * Inert membership-tier specification. NOT imported by checkout, webhooks, or live quota gates.
 * Proposed prices/caps require cost approval before any production use.
 */
export const PROPOSED_TIERS = Object.freeze([
  Object.freeze({ key: "starter", label: "Starter", proposedUsd: 9, proposedUses: 100 }),
  Object.freeze({ key: "growth", label: "Growth", proposedUsd: 15, proposedUses: 400 }),
  Object.freeze({ key: "premium", label: "Premium", proposedUsd: 25, proposedUses: 700 }),
  Object.freeze({ key: "elite", label: "Elite", proposedUsd: 39, proposedUses: 1200 }),
]);
export const EXISTING_MEMBER_PLAN = Object.freeze({
  key: "existing_400_v1",
  monthlyUses: 400,
  // This ID is already in use by the production Pickaxe provisioning path.
  pickaxeGroupId: "access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9",
});
const PRICE_ID = /^price_[A-Za-z0-9]+$/;
const GROUP_ID = /^access-[A-Za-z0-9-]+$/;

/**
 * Draft-only mapping validator. This is deliberately unable to request money,
 * grant access, or mint quota. Unknown prices fail closed.
 * @param {Array<{key:string,priceId:string,pickaxeGroupId:string,monthlyUses:number}>} rows
 */
export function validateDraftTierMapping(rows) {
  if (!Array.isArray(rows) || rows.length !== PROPOSED_TIERS.length) return false;
  const keys = new Set(), prices = new Set(), groups = new Set();
  for (const row of rows) {
    const candidate = PROPOSED_TIERS.find(t => t.key === row?.key);
    if (!candidate || keys.has(row.key) || !PRICE_ID.test(row.priceId || "") ||
      prices.has(row.priceId) || !GROUP_ID.test(row.pickaxeGroupId || "") ||
      groups.has(row.pickaxeGroupId) || row.pickaxeGroupId === EXISTING_MEMBER_PLAN.pickaxeGroupId ||
      row.monthlyUses !== candidate.proposedUses) return false;
    keys.add(row.key); prices.add(row.priceId); groups.add(row.pickaxeGroupId);
  }
  return true;
}
export function resolveDraftTier(verifiedStripePriceId, mapping) {
  if (!validateDraftTierMapping(mapping) || !PRICE_ID.test(verifiedStripePriceId || "")) return null;
  const row = mapping.find(t => t.priceId === verifiedStripePriceId);
  if (!row) return null;
  const definition = PROPOSED_TIERS.find(t => t.key === row.key);
  return Object.freeze({key:definition.key, label:definition.label, monthlyUses:row.monthlyUses, pickaxeGroupId:row.pickaxeGroupId});
}
