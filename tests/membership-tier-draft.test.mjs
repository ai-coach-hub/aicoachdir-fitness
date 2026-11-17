import test from "node:test";
import assert from "node:assert/strict";
import { PROPOSED_TIERS, EXISTING_MEMBER_PLAN, validateDraftTierMapping, resolveDraftTier } from "../lib/membershipTierDraft.mjs";

const mapping = PROPOSED_TIERS.map((p, i) => ({
  key: p.key, priceId: "price_ApprovedExample" + i,
  pickaxeGroupId: "access-test-tier-" + i,
  monthlyUses: p.proposedUses
}));

test("owner-approved names and unchanged legacy allowance", () => {
  assert.deepEqual(PROPOSED_TIERS.map(t => t.label), ["Starter", "Growth", "Premium", "Elite"]);
  assert.deepEqual(PROPOSED_TIERS.map(t => t.proposedUses), [100, 400, 700, 1200]);
  assert.equal(EXISTING_MEMBER_PLAN.monthlyUses, 400);
});
test("explicit complete draft mapping resolves known prices only", () => {
  assert.equal(validateDraftTierMapping(mapping), true);
  assert.equal(resolveDraftTier(mapping[2].priceId, mapping).key, "premium");
  assert.equal(resolveDraftTier("price_Unknown", mapping), null);
});
test("duplicates, missing plans and legacy group reuse are rejected", () => {
  assert.equal(validateDraftTierMapping(mapping.slice(1)), false);
  assert.equal(validateDraftTierMapping(mapping.map((p,i)=>i===1?{...p,priceId:mapping[0].priceId}:p)), false);
  assert.equal(validateDraftTierMapping(mapping.map((p,i)=>i===1?{...p,pickaxeGroupId:mapping[0].pickaxeGroupId}:p)), false);
  assert.equal(validateDraftTierMapping(mapping.map((p,i)=>i===1?{...p,pickaxeGroupId:EXISTING_MEMBER_PLAN.pickaxeGroupId}:p)), false);
});
