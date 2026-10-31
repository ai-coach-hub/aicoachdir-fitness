import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const src=readFileSync("lib/productionUpgradeCommand.ts","utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function("module","exports",js)(m,m.exports);
const check=m.exports.verifiedUpgradeCommand;
const base=()=>({memberVerified:true,stripeAccountLive:true,subscriptionVerified:true,billingPeriodVerified:true,walletReconciled:true,durableIntentStored:true,legacyMembership:false,currentPriceId:"price_Old123",targetPriceId:"price_New123",currentAmountCents:1500,targetAmountCents:2500,subscriptionId:"sub_ABC123",subscriptionItemId:"si_ABC123",customerId:"cus_ABC123",intentId:"upg_"+("a".repeat(36))});
test("approved upgrade is prorated and pending payment",()=>{
 const result=check(base());assert.equal(result.ok,true);
 assert.equal(result.params.proration_behavior,"always_invoice");
 assert.equal(result.params.payment_behavior,"pending_if_incomplete");
 assert.equal(result.params["items[0][price]"],"price_New123");
 assert.equal(result.idempotencyKey,"tier_upgrade_"+base().intentId);
});
for(const [name,delta,reason] of [
 ["missing verified member",{memberVerified:false},"identity_or_subscription_unverified"],
 ["unverified billing",{subscriptionVerified:false},"identity_or_subscription_unverified"],
 ["not live",{stripeAccountLive:false},"identity_or_subscription_unverified"],
 ["unverified dates",{billingPeriodVerified:false},"identity_or_subscription_unverified"],
 ["unreconciled wallet",{walletReconciled:false},"unreconciled_or_unstored_change"],
 ["unstored intent",{durableIntentStored:false},"unreconciled_or_unstored_change"],
 ["legacy account",{legacyMembership:true},"legacy_requires_explicit_migration"],
 ["not an upgrade",{targetAmountCents:900},"not_an_upgrade"],
 ["same price",{targetPriceId:"price_Old123"},"not_an_upgrade"],
 ["invalid intent",{intentId:"upg_bad"},"invalid_identifiers"],
]) test(name,()=>assert.equal(check({...base(),...delta}).reason,reason));
test("command remains side-effect free",()=>assert.doesNotMatch(src,/stripeRequest\(|fetch\(|INSERT INTO|UPDATE public/));
