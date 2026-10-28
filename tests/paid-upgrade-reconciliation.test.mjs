import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPaidUpgrade} from "../lib/paidUpgradeReconciliation.ts";
const key="member_"+"f".repeat(64),wallet={memberKey:key,entitlementKey:"existing_400_v1",
 periodStart:"2026-10-20T00:00:00Z",periodEnd:"2026-11-20T00:00:00Z",
 limitUses:400,completedUses:390,reservedUses:10};
const receipt={invoiceId:"in_12345678",customerId:"cus_12345678",subscriptionId:"sub_12345678",
 oldPriceId:"price_OLD123",targetPriceId:"price_NEW123",targetLimitUses:600};
const invoice={id:receipt.invoiceId,customer:receipt.customerId,subscription:receipt.subscriptionId,status:"paid",paid:true,amount_paid:525};
const subscription={id:receipt.subscriptionId,customer:receipt.customerId,status:"active",
 items:{data:[{price:{id:receipt.targetPriceId}}],has_more:false}};
const run=async(p={})=>{let calls=0;const result=await applyVerifiedPaidUpgrade({receipt,stripeInvoice:invoice,
 stripeSubscription:subscription,wallet,expectedMemberKey:key,
 applyAtomicWalletIncrease:async(a,b)=>{calls++;assert.equal(a,400);assert.equal(b,600);return "upgraded";},...p});return {result,calls};};
test("only paid invoice bound to the same current subscription can increase wallet",async()=>{
 const {result,calls}=await run();assert.deepEqual(result,{ok:true,status:"upgraded"});assert.equal(calls,1);
});
test("unpaid/mismatched invoices or stale price cannot update quota",async()=>{
 for(const p of [{stripeInvoice:{...invoice,status:"open"}},{stripeInvoice:{...invoice,paid:false}},
 {stripeInvoice:{...invoice,amount_paid:0}},
 {stripeInvoice:{...invoice,customer:"cus_WRONG123"}},
 {stripeSubscription:{...subscription,items:{data:[{price:{id:receipt.oldPriceId}}]}}},
 {expectedMemberKey:"member_"+"b".repeat(64)}]){
 const {result,calls}=await run(p);assert.equal(result.ok,false);assert.equal(calls,0);
 }
});
test("atomic concurrent transition mismatch cannot grant a second allowance",async()=>{
 const {result,calls}=await run({applyAtomicWalletIncrease:async()=> "stale_or_already_changed"});
 assert.deepEqual(result,{ok:false,reason:"wallet_refresh_required"});assert.equal(calls,0);
});
