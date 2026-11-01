import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../lib/renewalDowngradePolicy.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports},{timeout:3000});
const {planRenewalDowngrade}=mod.exports;
const fixture=(x={})=>({clerkUserId:"user_abcdefgh",linkedClerkUserId:"user_abcdefgh",
stripeCustomerId:"cus_customer1",subscriptionCustomerId:"cus_customer1",
stripeSubscriptionId:"sub_subscription1",subscriptionId:"sub_subscription1",
status:"active",cancelAtPeriodEnd:false,scheduleId:null,pendingUpdate:false,
subscriptionItemId:"si_item1",subscriptionItemCount:1,
currentPriceId:"price_premium1",targetPriceId:"price_growth1",
currentMonthlyCents:2500,targetMonthlyCents:1500,currentMessages:400,targetMessages:200,
periodEndEpoch:1800000000,nowEpoch:1790000000,otherActiveSubscriptionCount:0,walletReconciled:true,...x});
test("downgrade starts at renewal with no immediate invoice or allowance loss",()=>{
 const d=planRenewalDowngrade(fixture());
 assert.equal(d.ok,true);assert.equal(d.effectiveAt,1800000000);
 assert.equal(d.preserveCurrentBenefits,true);assert.equal(d.noImmediateInvoice,true);
 assert.equal(d.subscriptionId,"sub_subscription1");
});
for(const [name,change,reason] of [
 ["wrong member",{linkedClerkUserId:"user_otherabcd"},"unverified_member"],
 ["wrong customer",{subscriptionCustomerId:"cus_wrong"},"unverified_member"],
 ["wrong subscription",{subscriptionId:"sub_wrong"},"unverified_member"],
 ["already cancelling",{cancelAtPeriodEnd:true},"subscription_not_changeable"],
 ["scheduled",{scheduleId:"sub_sched1"},"subscription_not_changeable"],
 ["pending update",{pendingUpdate:true},"subscription_not_changeable"],
 ["past due",{status:"past_due"},"subscription_not_changeable"],
 ["multi item",{subscriptionItemCount:2},"subscription_items_or_duplicates"],
 ["duplicate subscription",{otherActiveSubscriptionCount:1},"subscription_items_or_duplicates"],
 ["unknown duplicate count",{otherActiveSubscriptionCount:undefined},"subscription_items_or_duplicates"],
 ["wallet not reconciled",{walletReconciled:false},"wallet_unreconciled"],
 ["wrong price",{targetPriceId:"unknown"},"price_unverified"],
 ["wrong time",{periodEndEpoch:1790000000},"pricing_or_period_invalid"],
 ["upgrade attempt",{targetMonthlyCents:3500,targetMessages:600},"not_a_downgrade"],
 ["same price",{targetMonthlyCents:2500},"not_a_downgrade"],
 ["same messages",{targetMessages:400},"not_a_downgrade"]
])test("blocks "+name,()=>assert.equal(planRenewalDowngrade(fixture(change)).reason,reason));
