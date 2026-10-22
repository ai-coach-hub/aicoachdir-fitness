import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../lib/stripeUsagePeriod.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const module={exports:{}};
runInNewContext(output,{module,exports:module.exports},{timeout:3000});
const {stripeUsageWindowFromVerifiedRecord:parse}=module.exports;

const periodStart="2026-10-01T00:00:00.000Z";
const periodEnd="2026-11-01T00:00:00.000Z";
const toSeconds=iso=>Math.floor(Date.parse(iso)/1000);
const expected={customerId:"cus_TestCustomer123",subscriptionId:"sub_TestSubscription123",priceId:"price_Monthly123"};
const raw=()=>({
 id:expected.subscriptionId,customer:expected.customerId,status:"active",
 cancel_at_period_end:false,
 items:{object:"list",has_more:false,data:[{
   id:"si_SingleMonthly123",subscription:expected.subscriptionId,
   price:{id:expected.priceId,recurring:{interval:"month",interval_count:1}},
   current_period_start:toSeconds(periodStart),
   current_period_end:toSeconds(periodEnd)
 }]}
});
const check=(record=raw(),expect=expected)=>parse(record,expect);

test("uses modern Stripe subscription item period for approved monthly price",()=>{
 const result=check();
 assert.deepEqual({...result},{
  ok:true,periodStart,periodEnd,priceId:expected.priceId
 });
});

test("supports older Stripe subscription-level billing periods only if item-level dates are absent",()=>{
 const record=raw();delete record.items.data[0].current_period_start;
 delete record.items.data[0].current_period_end;
 record.current_period_start=toSeconds(periodStart);
 record.current_period_end=toSeconds(periodEnd);
 assert.equal(check(record).ok,true);
 delete record.current_period_end;
 assert.equal(check(record).reason,"invalid_billing_period");
});

test("disagreed item-level and subscription-level periods fail closed",()=>{
 const record=raw();
 record.current_period_start=toSeconds(periodStart);
 record.current_period_end=toSeconds("2026-10-31T00:00:00.000Z");
 assert.equal(check(record).reason,"conflicting_billing_period");
 record.current_period_end=toSeconds(periodEnd);
 assert.equal(check(record).ok,true);
});

test("rejects wrong Stripe subscription/customer/price and non-monthly billing",()=>{
 assert.equal(check({...raw(),customer:"cus_SomebodyElse"}).reason,"invalid_subscription");
 assert.equal(check({...raw(),id:"sub_AnotherSubscription"}).reason,"invalid_subscription");
 assert.equal(check(raw(),{...expected,priceId:"price_NotAuthorized"}).reason,"unapproved_price");
 const annual=raw();annual.items.data[0].price.recurring.interval="year";
 assert.equal(check(annual).reason,"unapproved_price");
 const twoMonths=raw();twoMonths.items.data[0].price.recurring.interval_count=2;
 assert.equal(check(twoMonths).reason,"unapproved_price");
});

test("multiple items, incomplete lists, and absent periods do not grant AI usage",()=>{
 const extra=raw();
 extra.items.data.push({...extra.items.data[0],id:"si_OtherItem"});
 assert.equal(check(extra).reason,"ambiguous_items");
 const paged=raw();paged.items.has_more=true;
 assert.equal(check(paged).reason,"ambiguous_items");
 const empty=raw();empty.items.data=[];
 assert.equal(check(empty).reason,"ambiguous_items");
 const missing=raw();
 delete missing.items.data[0].current_period_start;
 delete missing.items.data[0].current_period_end;
 assert.equal(check(missing).reason,"invalid_billing_period");
});

test("malformed, reversed or unexpectedly long periods are rejected",()=>{
 const reversed=raw();
 reversed.items.data[0].current_period_end=toSeconds(periodStart)-1;
 assert.equal(check(reversed).reason,"invalid_billing_period");
 const annual=raw();
 annual.items.data[0].current_period_end=toSeconds("2027-10-01T00:00:00.000Z");
 assert.equal(check(annual).reason,"invalid_billing_period");
 const stringPeriod=raw();
 stringPeriod.items.data[0].current_period_start="1790812800";
 assert.equal(check(stringPeriod).reason,"invalid_billing_period");
});

test("parser makes no API calls and never creates subscription or entitlement",()=>{
 assert.doesNotMatch(source,/fetch\(|stripeRequest\(|INSERT INTO|UPDATE |DELETE FROM/);
 assert.equal(check().ok,true);
});
