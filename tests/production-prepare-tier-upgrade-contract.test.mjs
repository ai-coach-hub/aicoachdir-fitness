import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
for(const path of ["lib/productionPrepareTierUpgrade.ts","app/api/billing/tier-change/prepare/route.ts"]){
 const source=readFileSync(path,"utf8");
 test(path+" parses",()=>{const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 assert.equal(file.parseDiagnostics.length,0,file.parseDiagnostics.map(x=>String(x.messageText)).join(";"));});
}
test("preparation binds Clerk, billing customer, Stripe subscription and usage record",()=>{
 const c=readFileSync("lib/productionPrepareTierUpgrade.ts","utf8");
 for(const x of ["currentUser()","getFitnessMembership(email)","stripeRequest(","verifyWalletForTierChange",
 "ai_tier_change_intents","ON CONFLICT DO NOTHING RETURNING id",
 "br-sparkling-glitter-aucpz59d","PRODUCTION_TIER_TRANSACTIONS_ENABLED"])
 assert.ok(c.includes(x),x);
 assert.doesNotMatch(c,/stripeRequest\([^;]+method:\s*["']POST["']/);
});
test("public endpoint requires original origin and release flags",()=>{
 const c=readFileSync("app/api/billing/tier-change/prepare/route.ts","utf8");
 assert.match(c,/invalid_origin/);
 assert.match(c,/tierChangesEnabled/);
 const runtime=readFileSync("lib/tierChangeRuntime.ts","utf8");
 assert.match(runtime,/PUBLIC_TIER_UPGRADES_ENABLED/);
 assert.match(runtime,/PRODUCTION_TIER_TRANSACTIONS_ENABLED/);
});
