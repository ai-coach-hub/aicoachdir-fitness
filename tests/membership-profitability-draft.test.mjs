import test from "node:test";
import assert from "node:assert/strict";
import { PROPOSED_TIERS } from "../lib/membershipTierDraft.mjs";
import { modelFullUtilization, meetsFullUtilizationMargin } from "../lib/membershipProfitabilityDraft.mjs";

const exampleCosts={unitCostUsd:0.023,paymentFixedUsd:0.30,paymentRate:0.029,monthlyOverheadUsd:1};
test("full usage profitability is tested on every tier, not just typical use",()=>{
  const checks=PROPOSED_TIERS.map(t=>modelFullUtilization({...exampleCosts,priceUsd:t.proposedUsd,monthlyUses:t.proposedUses}));
  assert.deepEqual(checks.map(x=>Math.round(x.aiCostUsd*100)),[230,920,1610,2760]);
  assert.deepEqual(checks.map(x=>x.margin>=0.30),[true,false,false,false]);
});
test("higher model cost can cause full-usage loss on top tier",()=>{
  const r=modelFullUtilization({...exampleCosts,priceUsd:39,monthlyUses:1200,unitCostUsd:0.05});
  assert.ok(r.contributionUsd<0);
  assert.equal(meetsFullUtilizationMargin(PROPOSED_TIERS[3],{...exampleCosts,unitCostUsd:0.05}),false);
});
test("negative inputs, invalid plans, missing costs and unrealistic fees fail closed",()=>{
  assert.equal(modelFullUtilization({...exampleCosts,priceUsd:-1,monthlyUses:100}),null);
  assert.equal(modelFullUtilization({...exampleCosts,priceUsd:9,monthlyUses:0}),null);
  assert.equal(meetsFullUtilizationMargin(PROPOSED_TIERS[0],{...exampleCosts,unitCostUsd:NaN}),false);
  assert.equal(meetsFullUtilizationMargin(PROPOSED_TIERS[0],exampleCosts,1),false);
});
