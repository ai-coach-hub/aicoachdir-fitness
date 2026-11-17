import test from "node:test";
import assert from "node:assert/strict";
import { planSubscriptionChange } from "../lib/subscriptionTransitionPolicy.mjs";

const prices = { starter:"price_Start1", growth:"price_Growth1", premium:"price_Premium1", elite:"price_Elite1" };
function fixture(overrides={}) {
  return {
    verifiedClerkUserId:"user_123", linkedClerkUserId:"user_123",
    verifiedCustomerId:"cus_123", linkedSubscriptionId:"sub_123",
    subscription:{ id:"sub_123", customer:"cus_123", status:"active", cancel_at_period_end:false,
      items:{data:[{id:"si_123", quantity:1, price:{id:prices.growth}}]}},
    otherActiveSubscriptionCount:0, approvedPriceIds:prices, sharedAllowanceReady:true,
    targetTier:"premium", ...overrides
  };
}
test("upgrade plans in place, only after payment",()=>{
 const r=planSubscriptionChange(fixture());
 assert.equal(r.action,"upgrade"); assert.equal(r.subscriptionId,"sub_123");
 assert.equal(r.targetPriceId,prices.premium);
 assert.equal(r.effective,"after_successful_prorated_payment");
});
test("downgrade is not immediate",()=>{
 const r=planSubscriptionChange(fixture({targetTier:"starter"}));
 assert.equal(r.action,"downgrade"); assert.equal(r.effective,"next_billing_period");
 assert.equal(r.requiresSchedule,true);
});
test("same plan is not billed",()=>assert.equal(planSubscriptionChange(fixture({targetTier:"growth"})).action,"no_change"));
test("unknown or forged tier rejected",()=>assert.equal(planSubscriptionChange(fixture({targetTier:"free"})).reason,"unapproved_tier"));
test("wrong Clerk member rejected",()=>assert.equal(planSubscriptionChange(fixture({linkedClerkUserId:"user_wrong"})).reason,"identity_mismatch"));
test("wrong Stripe customer rejected",()=>assert.equal(planSubscriptionChange(fixture({verifiedCustomerId:"cus_wrong"})).reason,"subscription_mismatch"));
test("wrong subscription rejected",()=>assert.equal(planSubscriptionChange(fixture({linkedSubscriptionId:"sub_wrong"})).reason,"subscription_mismatch"));
test("second subscription is blocked",()=>assert.equal(planSubscriptionChange(fixture({otherActiveSubscriptionCount:1})).reason,"multiple_or_unverified_subscriptions"));
test("unknown subscription count is blocked",()=>assert.equal(planSubscriptionChange(fixture({otherActiveSubscriptionCount:undefined})).reason,"multiple_or_unverified_subscriptions"));
test("shared message ledger must be ready",()=>assert.equal(planSubscriptionChange(fixture({sharedAllowanceReady:false})).reason,"shared_allowance_not_ready"));
test("incomplete prices block changes",()=>assert.equal(planSubscriptionChange(fixture({approvedPriceIds:{...prices,elite:""}})).reason,"price_mapping_incomplete"));
test("legacy subscriber cannot be silently repriced",()=>{
 const f=fixture(); f.subscription.items.data[0].price.id="price_Legacy400";
 assert.equal(planSubscriptionChange(f).reason,"legacy_plan_requires_explicit_choice");
});
test("cancelling subscriber protected",()=>{
 const f=fixture(); f.subscription.cancel_at_period_end=true;
 assert.equal(planSubscriptionChange(f).reason,"subscription_not_changeable");
});
test("past due subscriber protected",()=>{
 const f=fixture(); f.subscription.status="past_due";
 assert.equal(planSubscriptionChange(f).reason,"subscription_not_changeable");
});
test("scheduled or pending changes protected",()=>{
 const f=fixture(); f.subscription.schedule="sub_sched_123";
 assert.equal(planSubscriptionChange(f).reason,"subscription_not_changeable");
});
test("multi-item subscriptions not modified",()=>{
 const f=fixture(); f.subscription.items.data.push({id:"si_2",quantity:1,price:{id:prices.starter}});
 assert.equal(planSubscriptionChange(f).reason,"unsupported_subscription_items");
});
