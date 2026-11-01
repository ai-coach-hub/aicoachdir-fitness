import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const service=readFileSync("lib/productionTierChangePreflight.ts","utf8");
const route=readFileSync("app/api/billing/tier-change/preflight/route.ts","utf8");
for(const [name,source] of [["service",service],["route",route]]){
 test(name+" parses as TypeScript",()=>{
  const parsed=ts.createSourceFile(name+".ts",source,ts.ScriptTarget.Latest,true);
  assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(x=>x.messageText).join("; "));
 });
}
test("service verifies both production and public release switches",()=>{
 assert.match(service,/PUBLIC_TIER_UPGRADES_ENABLED/);
 assert.match(service,/SHARED_USAGE_PUBLIC_RELEASE_APPROVED/);
 assert.match(service,/VERCEL_ENV.*production/);
});
test("service uses verified Stripe and wallet preflight",()=>{
 assert.match(service,/currentUser\(/);
 assert.match(service,/verification\?\.status/);
 assert.match(service,/stripeRequest\(/);
 assert.match(service,/stripeUsageWindowFromVerifiedRecord\(/);
 assert.match(service,/verifyWalletForTierChange\(/);
 assert.match(service,/grandfathered_or_unknown_price_requires_review/);
});
test("route has no subscription mutation or wallet-write calls",()=>{
 assert.doesNotMatch(route,/stripeRequest|INSERT INTO|UPDATE public|reserveSharedUsage|method:\s*["']POST["']/);
 assert.match(route,/tier_changes_disabled/);
 assert.match(route,/invalid_origin/);
});
