import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const compiled=ts.transpileModule(readFileSync("lib/productionTierWalletPreflight.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports",compiled)(mod,mod.exports);
const check=mod.exports.verifyWalletForTierChange;
const valid=()=>({verifiedMember:true,uniqueLinkedSubscription:true,activeSubscription:true,grandfatheredPlan:false,approvedCurrentPrice:true,stripePeriodStart:"2026-10-01T00:00:00.000Z",stripePeriodEnd:"2026-11-01T00:00:00.000Z",nowMillis:Date.parse("2026-10-30T00:00:00.000Z"),walletRows:[{periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limit:400,completed:89,reserved:10}]});
test("preserves usage and reservations",()=>assert.deepEqual(check(valid()),{ok:true,remaining:301,allowance:400,periodEnd:"2026-11-01T00:00:00.000Z"}));
for(const [name,change,reason] of [
 ["missing identity",{verifiedMember:false},"member_not_verified"],
 ["unlinked subscription",{uniqueLinkedSubscription:false},"member_not_verified"],
 ["inactive subscription",{activeSubscription:false},"subscription_not_active"],
 ["grandfathered terms",{grandfatheredPlan:true},"grandfathered_plan_requires_opt_in"],
 ["unknown Stripe price",{approvedCurrentPrice:false},"current_price_not_approved"],
 ["missing wallet",{walletRows:[]},"wallet_missing_or_ambiguous"],
 ["wrong current period",{walletRows:[{periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limit:400,completed:89,reserved:10}]},"wallet_period_mismatch"],
 ["expired period",{nowMillis:Date.parse("2026-11-02T00:00:00.000Z")},"billing_period_invalid"],
 ["excess reservations",{walletRows:[{periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limit:400,completed:399,reserved:10}]},"wallet_counter_inconsistent"],
 ["negative usage",{walletRows:[{periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",limit:400,completed:-1,reserved:0}]},"wallet_counter_inconsistent"],
]) test(name,()=>assert.equal(check({...valid(),...change}).reason,reason));
