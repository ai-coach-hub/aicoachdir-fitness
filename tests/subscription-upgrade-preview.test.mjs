import test from "node:test";
import assert from "node:assert/strict";
import { buildUpgradePreviewRequest,summarizeUpgradePreview } from "../lib/subscriptionUpgradePreview.mjs";
const plan = {ok:true,action:"upgrade",requiresBillingPreview:true,subscriptionId:"sub_abc123",subscriptionItemId:"si_abc123",targetPriceId:"price_abc123"};
test("builds a read-only Stripe invoice preview with exact item replacement",()=>{
 const p=buildUpgradePreviewRequest(plan,1793242554);
 assert.equal(p.get("subscription"),"sub_abc123");
 assert.equal(p.get("subscription_details[items][0][id]"),"si_abc123");
 assert.equal(p.get("subscription_details[items][0][price]"),"price_abc123");
 assert.equal(p.get("subscription_details[proration_behavior]"),"always_invoice");
 assert.equal(p.get("subscription_details[proration_date]"),"1793242554");
 assert.equal(p.get("subscription_details[items][0][quantity]"),"1");
 assert.equal(p.has("customer"),false);
});
test("refuses unsupported update or unverified price",()=>{
 for(const bad of [{...plan,action:"downgrade"},{...plan,ok:false},{...plan,targetPriceId:""}]){
  assert.throws(()=>buildUpgradePreviewRequest(bad,1793242554));
 }
 assert.throws(()=>buildUpgradePreviewRequest(plan,0));
});
test("summarizes verified Stripe sandbox proration with separate credit and debit",()=>{
 const invoice={object:"invoice",id:"upcoming_in_123",amount_due:967,currency:"usd",lines:{data:[
 {amount:-1452,parent:{subscription_item_details:{proration:true}}},
 {amount:2419,parent:{subscription_item_details:{proration:true}}}
 ]}};
 const quote=summarizeUpgradePreview(invoice);
 assert.deepEqual(quote,{amountDueCents:967,currency:"usd",prorationNetCents:967,creditCents:-1452,chargeCents:2419,estimated:true});
});
test("rejects missing or incomplete invoices",()=>{
 assert.throws(()=>summarizeUpgradePreview({}));
 assert.throws(()=>summarizeUpgradePreview({object:"invoice",id:"upcoming_in_123",amount_due:1,currency:"usd",lines:{data:[]}}));
});
