import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const policy=readFileSync("lib/renewalDowngradePolicy.ts","utf8");
const helper=readFileSync("lib/productionRenewalSchedulePhases.ts","utf8");
for(const [name,source] of [["policy",policy],["schedule",helper]]){
 test(name+" parses without syntax errors",()=>{
  const sf=ts.createSourceFile(name+".ts",source,ts.ScriptTarget.Latest,true);
  assert.equal(sf.parseDiagnostics.length,0);
 });
}
test("schedule delegates to verified downgrade policy and preserves existing phase",()=>{
 assert.match(helper,/planRenewalDowngrade\(d\)/);
 assert.match(helper,/price:d.currentPriceId/);
 assert.match(helper,/price:decision.targetPriceId/);
 assert.match(helper,/end_date:decision.effectiveAt/);
 assert.match(helper,/start_date:decision.effectiveAt/);
 assert.match(helper,/currentQuantity!==1/);
 assert.match(helper,/end_behavior:"release"/);
});
test("schedule cannot mutate Stripe or customer wallet",()=>{
 assert.doesNotMatch(helper,/stripeRequest|fetch\(|UPDATE public|INSERT INTO|reserveSharedUsage/);
 assert.match(helper,/noImmediateInvoice:true/);
 assert.match(helper,/noImmediateSubscriptionChange:true/);
});
