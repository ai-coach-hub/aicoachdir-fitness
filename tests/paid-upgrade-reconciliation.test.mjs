import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPaidUpgrade} from "../lib/paidUpgradeReconciliation.ts";
const key="member_"+"f".repeat(64),wallet={memberKey:key,entitlementKey:"existing_400_v1",
 periodStart:"2026-10-28T02:55:54.000Z",periodEnd:"2026-11-28T02:55:54.000Z",
 limitUses:100,completedUses:90,reservedUses:10};
const start=Math.floor(Date.parse(wallet.periodStart)/1000);
const end=Math.floor(Date.parse(wallet.periodEnd)/1000);
const receipt={invoiceId:"in_12345678",customerId:"cus_12345678",subscriptionId:"sub_12345678",
 subscriptionItemId:"si_12345678",oldPriceId:"price_OLD123",targetPriceId:"price_NEW123",targetLimitUses:200};
function proration(amount,price){
 return {amount,period:{start:start+2,end},
 pricing:{price_details:{price}},parent:{subscription_item_details:{
 proration:true,subscription:receipt.subscriptionId,subscription_item:receipt.subscriptionItemId}}};
}
// Real Stripe 2026 schema: invoice.subscription and invoice.paid can be absent.
// Billing subscription relationship is in parent.subscription_details.
const invoice={id:receipt.invoiceId,customer:receipt.customerId,livemode:false,
 parent:{type:"subscription_details",subscription_details:{subscription:receipt.subscriptionId}},
 billing_reason:"subscription_update",currency:"usd",status:"paid",amount_paid:600,
 lines:{has_more:false,data:[proration(-900,receipt.oldPriceId),proration(1500,receipt.targetPriceId)]}};
const subscription={id:receipt.subscriptionId,customer:receipt.customerId,status:"active",
 items:{has_more:false,data:[{id:receipt.subscriptionItemId,
 current_period_start:start,current_period_end:end,
 price:{id:receipt.targetPriceId,recurring:{interval:"month",interval_count:1}}}]}};
const run=async(p={})=>{let calls=0;const result=await applyVerifiedPaidUpgrade({
 receipt,stripeInvoice:invoice,stripeSubscription:subscription,wallet,
 expectedMemberKey:key,applyAtomicWalletIncrease:async(a,b)=>{calls++;
 assert.equal(a,100);assert.equal(b,200);return "upgraded";},...p});return {result,calls};};
test("modern paid upgrade invoice grants more allowance only in the original period",async()=>{
 const {result,calls}=await run();
 assert.deepEqual(result,{ok:true,status:"upgraded"});assert.equal(calls,1);
});
test("unpaid/mismatched/renewal invoices or stale Stripe price cannot change quota",async()=>{
 for(const changes of [
 {stripeInvoice:{...invoice,status:"open"}},
 {stripeInvoice:{...invoice,amount_paid:0}},
 {stripeInvoice:{...invoice,billing_reason:"subscription_cycle"}},
 {stripeInvoice:{...invoice,customer:"cus_WRONG123"}},
 {stripeInvoice:{...invoice,parent:{subscription_details:{subscription:"sub_WRONG123"}}}},
 {stripeInvoice:{...invoice,lines:{has_more:false,data:[]}}},
 {stripeInvoice:{...invoice,lines:{has_more:false,data:[proration(-900,receipt.oldPriceId),proration(1500,"price_WRONG123")]}}},
 {stripeSubscription:{...subscription,items:{data:[{...subscription.items.data[0],price:{id:receipt.oldPriceId}}]}}},
 {stripeSubscription:{...subscription,items:{data:[{...subscription.items.data[0],current_period_end:end+86400}]}}},
 {expectedMemberKey:"member_"+"b".repeat(64)}
 ]){
  const {result,calls}=await run(changes);assert.equal(result.ok,false);assert.equal(calls,0);
 }
});
test("stale atomic update is not reported as a successful grant",async()=>{
 const {result}=await run({applyAtomicWalletIncrease:async()=> "stale_or_already_changed"});
 assert.deepEqual(result,{ok:false,reason:"wallet_refresh_required"});
});
