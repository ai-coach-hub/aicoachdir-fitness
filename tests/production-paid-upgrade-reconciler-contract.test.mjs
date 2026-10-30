import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const paths=[
 "lib/productionPaidUpgradeReconciler.ts",
 "app/api/billing/tier-change/webhook/route.ts"
];
for(const path of paths){
 const source=readFileSync(path,"utf8");
 test(path+" parses",()=>{
 const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>String(d.messageText)).join(";"));
 });
}
test("webhook verifies HMAC before processing and remains off",()=>{
 const x=readFileSync(paths[1],"utf8");
 assert.match(x,/createHmac/);assert.match(x,/timingSafeEqual/);
 assert.match(x,/PRODUCTION_UPGRADE_WEBHOOK_ENABLED/);
 assert.match(x,/PUBLIC_TIER_UPGRADES_ENABLED/);
 assert.match(x,/livemode!==true/);
});
test("reconciler binds invoice to intent and invokes atomic transition",()=>{
 const x=readFileSync(paths[0],"utf8");
 for(const guard of [
 "verifyPaidUpgradeInvoice",
 "ai_tier_change_intents",
 "stripeUsageWindowFromVerifiedRecord",
 "ai_tier_apply_verified_paid_upgrade",
 "br-sparkling-glitter-aucpz59d",
 "PUBLIC_TIER_UPGRADES_ENABLED"
 ])assert.ok(x.includes(guard),guard);
 assert.doesNotMatch(x,/INSERT INTO public\.shared_ai_usage_periods/);
});
test("migration has immutable paid invoice binding and replay protection",()=>{
 const x=readFileSync("migrations/20261030_production_tier_change_intents_DRAFT.sql","utf8");
 for(const guard of ["invoice_id text UNIQUE","FOR UPDATE","already_applied",
 "w.completed_uses+w.reserved_uses","REVOKE ALL"])
 assert.ok(x.includes(guard),guard);
 assert.doesNotMatch(x,/DROP TABLE|TRUNCATE TABLE|DELETE FROM/i);
});
