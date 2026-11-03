import test from "node:test";
import assert from "node:assert/strict";
import {verifyWalletIncrease} from "../lib/upgradeWalletTransition.ts";
const memberKey="member_"+"a".repeat(64);
const before={memberKey,entitlementKey:"existing_400_v1",
 periodStart:"2026-10-20T00:00:00.000Z",periodEnd:"2026-11-20T00:00:00.000Z",
 limitUses:400,completedUses:375,reservedUses:7};
const change={sameMemberKey:memberKey,samePeriodStart:before.periodStart,
 samePeriodEnd:before.periodEnd,oldPriceId:"price_STarter100",newPriceId:"price_ELITE600",
 targetLimitUses:600,stripeInvoicePaid:true,stripeSubscriptionActive:true};
test("paid upgrade retains completed and reserved messages within existing period",()=>{
 assert.deepEqual(verifyWalletIncrease(before,change),{ok:true,
 nextLimitUses:600,retainedCompleted:375,retainedReserved:7,availableMessages:218});
});
test("unpaid, stale, wrong-member or rekeyed wallet transitions fail closed",()=>{
 for(const c of [{stripeInvoicePaid:false},{stripeSubscriptionActive:false},
 {sameMemberKey:"member_"+"b".repeat(64)},{samePeriodStart:"2026-10-21T00:00:00.000Z"},
 {oldPriceId:"invalid"},{newPriceId:"price_STarter100"},{targetLimitUses:400},
 {targetLimitUses:10001}])
 assert.equal(verifyWalletIncrease(before,{...change,...c}).ok,false);
});
test("spent and held credits cannot be reset or exceed original cap",()=>{
 assert.equal(verifyWalletIncrease({...before,completedUses:400,reservedUses:1},change).ok,false);
 assert.equal(verifyWalletIncrease({...before,completedUses:-1},change).ok,false);
});
