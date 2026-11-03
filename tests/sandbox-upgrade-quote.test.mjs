import test from "node:test";
import assert from "node:assert/strict";
import {verifySandboxUpgradeQuote} from "../lib/sandboxUpgradeQuote.ts";
const a={customerId:"cus_TEST12345678",subscriptionId:"sub_TEST12345678",
 subscriptionItemId:"si_TEST12345678",oldPriceId:"price_OLD123",
 newPriceId:"price_NEW456",periodEnd:"2026-11-28T00:00:00.000Z"};
const line=(amount,price)=>({amount,pricing:{price_details:{price}},parent:{subscription_item_details:{
 proration:true,subscription:a.subscriptionId,subscription_item:a.subscriptionItemId}},
 period:{start:1793204334,end:Date.parse(a.periodEnd)/1000}});
const preview={currency:"usd",customer:a.customerId,amount_due:980,lines:{data:[line(-1470,a.oldPriceId),line(2450,a.newPriceId)],has_more:false}};
test("exact two-line same-item credit and charge is approved",()=>assert.deepEqual(verifySandboxUpgradeQuote({preview,...a}),{ok:true,amountCents:980}));
test("unrelated invoice fees, wrong customers, changed periods and replay ambiguity are denied",()=>{
 for(const p of [
 {...preview,amount_due:981},
 {...preview,customer:"cus_OTHER"},
 {...preview,lines:{data:[...preview.lines.data,line(100,"price_OTHER")]}},
 {...preview,lines:{data:[line(-1470,a.oldPriceId),line(2450,"price_WRONG")]}},
 {...preview,lines:{data:[line(-1470,a.oldPriceId),{...line(2450,a.newPriceId),period:{end:1}}]}}
 ])assert.equal(verifySandboxUpgradeQuote({preview:p,...a}).ok,false);
});
