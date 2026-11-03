import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPaidUpgrade} from "../lib/paidUpgradeReconciliation.ts";

// Regression fixture modeled on the verified 2026-10-29 Stripe test invoice:
// Growth credit -1452, Premium charge +2419, paid +967 cents.
// This test never connects to Stripe or writes to Neon.
const memberKey="member_"+"f".repeat(64);
const periodStart="2026-10-28T02:55:54.000Z";
const periodEnd="2026-11-28T02:55:54.000Z";
const receipt={
 invoiceId:"in_1UVjbM3gZjBKyfbcrmfn5zpV",
 customerId:"cus_VWPrdd2my3TidX",
 subscriptionId:"sub_1UVN1q3gZjBKyfbcAtOhPwsU",
 subscriptionItemId:"si_VWPrBK0Gua3eAe",
 oldPriceId:"price_1UVMzH3gZjBKyfbc3h1zn1ZG",
 targetPriceId:"price_1UVMzJ3gZjBKyfbcoYRB0IAT",
 targetLimitUses:400
};
const item={id:receipt.subscriptionItemId,
 current_period_start:1793156154,current_period_end:1795834554,
 price:{id:receipt.targetPriceId,recurring:{interval:"month",interval_count:1}}};
const subscription={id:receipt.subscriptionId,customer:receipt.customerId,status:"active",
 items:{data:[item],has_more:false}};
const line=(amount,price)=>({
 amount,period:{start:1793242554,end:1795834554},
 pricing:{price_details:{price}},
 parent:{subscription_item_details:{proration:true,subscription:receipt.subscriptionId,
 subscription_item:receipt.subscriptionItemId}}
});
const invoice={id:receipt.invoiceId,customer:receipt.customerId,status:"paid",
 billing_reason:"subscription_update",currency:"usd",amount_paid:967,
 parent:{subscription_details:{subscription:receipt.subscriptionId}},
 lines:{data:[line(-1452,receipt.oldPriceId),line(2419,receipt.targetPriceId)],has_more:false}};
const wallet={memberKey,entitlementKey:"existing_400_v1",periodStart,periodEnd,
 limitUses:200,completedUses:89,reservedUses:10};
const run=async(overrides={})=>{
 let calls=0;
 const result=await applyVerifiedPaidUpgrade({
 receipt,stripeInvoice:invoice,stripeSubscription:subscription,wallet,
 expectedMemberKey:memberKey,
 applyAtomicWalletIncrease:async(oldLimit,newLimit)=>{
  calls++;assert.equal(oldLimit,200);assert.equal(newLimit,400);return "upgraded";
 },...overrides
 });
 return {result,calls};
};
test("verified paid sandbox upgrade grants 400 while retaining 89 completed and 10 reserved",async()=>{
 const {result,calls}=await run();
 assert.deepEqual(result,{ok:true,status:"upgraded"});
 assert.equal(calls,1);
 assert.equal(400-wallet.completedUses-wallet.reservedUses,301);
});
test("test invoice cannot grant messages if unpaid, mismatched or not a prorated subscription update",async()=>{
 for(const v of [
 {stripeInvoice:{...invoice,status:"open"}},
 {stripeInvoice:{...invoice,amount_paid:0}},
 {stripeInvoice:{...invoice,billing_reason:"manual"}},
 {stripeInvoice:{...invoice,customer:"cus_wrong"}},
 {stripeInvoice:{...invoice,lines:{data:[line(-1452,receipt.oldPriceId)],has_more:false}}},
 {stripeSubscription:{...subscription,items:{data:[{...item,price:{id:receipt.oldPriceId}}],has_more:false}}},
 {expectedMemberKey:"member_"+"a".repeat(64)}
 ]){const {result,calls}=await run(v);assert.equal(result.ok,false);assert.equal(calls,0);}
});
test("a stale wallet transaction never reports a successful grant",async()=>{
 const {result}=await run({applyAtomicWalletIncrease:async()=>"stale_or_already_changed"});
 assert.deepEqual(result,{ok:false,reason:"wallet_refresh_required"});
});
