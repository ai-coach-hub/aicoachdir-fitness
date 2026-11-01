import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const c=ts.transpileModule(readFileSync("lib/productionTierTransactionReadiness.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};new Function("module","exports",c)(m,m.exports);
const check=m.exports.verifyTierTransactionReadiness;
const all={authenticatedUpgradeHandlerReady:true,persistentIntentRoundTripTested:true,
stripeSandboxProrationAndPaymentTested:true,signedWebhookRetryAndIdempotencyTested:true,
renewalDowngradeScheduleTested:true,renewalWalletTransitionTested:true,
migrationVerifiedAgainstIsolatedBranch:true,productionRiskEventsHandled:true};
test("all release evidence required",()=>assert.deepEqual(check(all),{ok:true}));
for(const key of Object.keys(all))test("missing "+key+" denies release",()=>{
 const result=check({...all,[key]:false});
 assert.equal(result.ok,false);
 assert.deepEqual(result.missing,[key]);
});
test("empty evidence always denies release",()=>assert.equal(check({}).ok,false));
