import test from "node:test";
import assert from "node:assert/strict";
import {applyVerifiedPaidUpgrade} from "../lib/paidUpgradeReconciliation.ts";
import {resolveSandboxAllowance} from "../lib/sandboxVerifiedAllowance.ts";

const t0=1793156154,t1=1795834554;
const periodStart=new Date(t0*1000).toISOString(),periodEnd=new Date(t1*1000).toISOString();
const customerId="cus_TEST12345678",subscriptionId="sub_TEST12345678",subscriptionItemId="si_TEST12345678";
const oldPriceId="price_1UVMzH3gZjBKyfbc3h1zn1ZG",targetPriceId="price_1UVMzJ3gZjBKyfbcoYRB0IAT";
const memberKey="member_"+"c".repeat(64),entitlementKey="existing_400_v1";
const wallet={memberKey,entitlementKey,periodStart,periodEnd,limitUses:200,completedUses:89,reservedUses:10};
const receipt={invoiceId:"in_TEST12345678",customerId,subscriptionId,subscriptionItemId,oldPriceId,targetPriceId,targetLimitUses:400};
const sub={id:subscriptionId,customer:customerId,status:"active",cancel_at_period_end:false,pending_update:null,
 items:{has_more:false,data:[{id:subscriptionItemId,current_period_start:t0,current_period_end:t1,price:{id:targetPriceId,recurring:{interval:"month",interval_count:1}}}]}};
const line=(price,amount)=>({amount,period:{start:t0+1000,end:t1},parent:{subscription_item_details:{
 proration:true,subscription:subscriptionId,subscription_item:subscriptionItemId}},pricing:{price_details:{price}}});
const invoice={id:receipt.invoiceId,customer:customerId,parent:{subscription_details:{subscription:subscriptionId}},status:"paid",paid:true,livemode:false,
 currency:"usd",billing_reason:"subscription_update",amount_paid:1000,lines:{has_more:false,data:[line(oldPriceId,-1500),line(targetPriceId,2500)]}};
const args=(over={})=>({receipt,stripeInvoice:invoice,stripeSubscription:sub,wallet,expectedMemberKey:memberKey,
 applyAtomicWalletIncrease:async(expected,target)=>expected===200&&target===400?"upgraded":"mismatch",...over});

test("paid Growth-to-Premium invoice increases only the limit, retaining 89 completed and 10 reserved messages",async()=>{
 const r=await applyVerifiedPaidUpgrade(args());
 assert.deepEqual(r,{ok:true,status:"upgraded"});
 const after={...wallet,limitUses:400};
 const permit=resolveSandboxAllowance({vercelEnv:"preview",stripeMode:"test",customerId,subscriptionId,memberKey,subscription:sub,wallet:after});
 assert.equal(permit.ok,true);
 if(permit.ok)assert.equal(permit.limitUses,400);
 assert.equal(after.completedUses,89);
 assert.equal(after.reservedUses,10);
 assert.equal(after.limitUses-after.completedUses-after.reservedUses,301);
});
test("unpaid, unmatched, ambiguous or wrong subscription item invoices cannot grant any messages",async()=>{
 const invalid=[
  {stripeInvoice:{...invoice,status:"open",paid:false}},
  {stripeInvoice:{...invoice,customer:"cus_OTHER"}},
  {stripeInvoice:{...invoice,lines:{...invoice.lines,data:[line(targetPriceId,2500)]}}},
  {stripeSubscription:{...sub,items:{...sub.items,data:[{...sub.items.data[0],id:"si_OTHER"}]}}},
  {wallet:{...wallet,memberKey:"member_"+"d".repeat(64)}}
 ];
 for(const mutation of invalid){
  let writes=0;
  const out=await applyVerifiedPaidUpgrade(args({...mutation,applyAtomicWalletIncrease:async()=>{writes++;return "upgraded";}}));
  assert.equal(out.ok,false);
  assert.equal(writes,0);
 }
});
