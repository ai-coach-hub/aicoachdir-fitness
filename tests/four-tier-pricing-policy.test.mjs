import test from "node:test";
import assert from "node:assert/strict";
import {proposedFourTierPlans,grandfatheredMembership,legacyPlanDecision} from "../lib/fourTierPricingPolicy.ts";
test("business-approved tier targets are distinct and ascending",()=>{
 assert.deepEqual(proposedFourTierPlans.map(p=>[p.tier,p.monthlyUsdCents,p.includedMessages]),[
 ["starter",900,100],["growth",1500,200],["premium",2500,400],["elite",3500,600]]);
});
test("original subscribers retain their original $15 and 400-message value",()=>{
 assert.equal(grandfatheredMembership.legacyMonthlyUsdCents,1500);
 assert.equal(grandfatheredMembership.legacyIncludedMessages,400);
 assert.deepEqual(legacyPlanDecision("keep"),{retainLegacyTerms:true,needsExplicitWarning:false,preserveSavedWork:true});
});
test("voluntary changes require warning but never erase history",()=>{
 for(const action of ["switch","cancel","rejoin"]){
  const outcome=legacyPlanDecision(action);
  assert.equal(outcome.retainLegacyTerms,false);
  assert.equal(outcome.needsExplicitWarning,true);
  assert.equal(outcome.preserveSavedWork,true);
 }
});
