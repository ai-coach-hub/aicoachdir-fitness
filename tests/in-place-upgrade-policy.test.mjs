import test from "node:test";
import assert from "node:assert/strict";
import {decideInPlaceUpgrade} from "../lib/inPlaceUpgradePolicy.ts";

const approved=[
 {tier:"starter",stripePriceId:"price_STarter100",monthlyUsdCents:900,includedMessages:100},
 {tier:"growth",stripePriceId:"price_GR0wth200",monthlyUsdCents:1500,includedMessages:200},
 {tier:"premium",stripePriceId:"price_PREm400",monthlyUsdCents:2500,includedMessages:400},
 {tier:"elite",stripePriceId:"price_ELITE600",monthlyUsdCents:3500,includedMessages:600},
];
const now=Date.parse("2026-10-27T12:00:00.000Z");
const member={
 clerkUserId:"user_12345678",membershipClerkUserId:"user_12345678",
 stripeCustomerId:"cus_12345678",subscriptionCustomerId:"cus_12345678",
 stripeSubscriptionId:"sub_12345678",subscriptionId:"sub_12345678",
 status:"active",billingPeriodStart:"2026-10-20T00:00:00.000Z",
 billingPeriodEnd:"2026-11-20T00:00:00.000Z",
 currentPriceId:"price_GR0wth200",currentIncludedMessages:200,
 completedMessages:189,reservedMessages:5,priorLedgerReconciled:true
};
const run=(change={},target="premium",catalog=approved)=>
 decideInPlaceUpgrade({...member,...change},target,catalog,now);
test("verified member can request higher-cap same-period plan",()=>{
 assert.deepEqual(run(),{ok:true,current:approved[1],target:approved[2],preservePeriod:true,mustInvoiceBeforeGrant:true});
});
test("mismatched Clerk and Stripe bindings cannot change a subscription",()=>{
 for(const change of [
 {membershipClerkUserId:"user_another88"},
 {subscriptionCustomerId:"cus_another88"},
 {subscriptionId:"sub_another88"},
 {stripeCustomerId:""},
 ])assert.equal(run(change).ok,false);
});
test("no unapproved prices, fabricated catalog or unknown legacy plans",()=>{
 assert.equal(run({currentPriceId:"price_OLDlegacy"}).ok,false);
 assert.equal(run({},"elite",[]).ok,false);
 assert.equal(run({},"elite",[...approved,approved[0]]).ok,false);
 assert.equal(run({},"elite",[{...approved[0],stripePriceId:"not-a-price"},...approved.slice(1)]).ok,false);
});
test("no double allowance on exhausted, malformed or unreconciled periods",()=>{
 for(const change of [
 {priorLedgerReconciled:false},{completedMessages:201},
 {reservedMessages:12},{billingPeriodEnd:"2026-10-01T00:00:00Z"},
 {status:"canceled"},{status:"past_due"}
 ])assert.equal(run(change).ok,false);
});
test("downgrades and same-tier changes are not instant upgrades",()=>{
 assert.equal(run({},"starter").ok,false);
 assert.equal(run({},"growth").ok,false);
});
