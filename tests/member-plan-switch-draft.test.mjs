import test from "node:test";
import assert from "node:assert/strict";
import {planSwitchDecision,safeUsageAtChange} from "../lib/memberPlanSwitchDraft.mjs";
test("upgrade waits for payment; downgrade waits for renewal",()=>{
  assert.equal(planSwitchDecision({currentRank:1,targetRank:3,subscriptionActive:true}).effective,"after-confirmed-payment");
  assert.equal(planSwitchDecision({currentRank:3,targetRank:0,subscriptionActive:true}).effective,"next-paid-renewal");
  assert.equal(planSwitchDecision({currentRank:1,targetRank:3,subscriptionActive:false}).kind,"blocked");
  assert.equal(planSwitchDecision({currentRank:1,targetRank:1,subscriptionActive:true}).kind,"unchanged");
  assert.equal(planSwitchDecision({currentRank:1,targetRank:3,subscriptionActive:true,alreadyScheduled:true}).kind,"review-pending-change");
});
test("upgrade preserves used messages and requires confirmed payment",()=>{
  assert.deepEqual(safeUsageAtChange({used:345,reserved:2,currentLimit:400,targetLimit:700,paidUpgradeConfirmed:false}),{limit:400,used:345,reserved:2,pendingPayment:true});
  assert.deepEqual(safeUsageAtChange({used:345,reserved:2,currentLimit:400,targetLimit:700,paidUpgradeConfirmed:true}),{limit:700,used:345,reserved:2});
});
test("downgrade retains paid allowance until renewal",()=>{
  assert.deepEqual(safeUsageAtChange({used:345,reserved:2,currentLimit:400,targetLimit:100}),{limit:400,used:345,reserved:2,pendingLimit:100});
  assert.deepEqual(safeUsageAtChange({used:345,reserved:2,currentLimit:400,targetLimit:100,renewalReached:true}),{limit:100,used:0,reserved:0});
});
test("invalid usage or rank fails closed",()=>{
  assert.equal(safeUsageAtChange({used:401,reserved:0,currentLimit:400,targetLimit:700}),null);
  assert.equal(planSwitchDecision({currentRank:1,targetRank:100,subscriptionActive:true}).kind,"blocked");
});
