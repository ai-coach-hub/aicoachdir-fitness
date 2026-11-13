import test from "node:test";
import assert from "node:assert/strict";
import {assessIsolatedTrialConversion} from "../lib/isolatedTrialConversionPolicy.ts";
const valid={
 verifiedClerkUserId:"user_12345678",
 trialGrantClerkUserId:"user_12345678",
 paymentClerkUserId:"user_12345678",
 stripeSessionPaid:true,
 stripeSubscriptionActive:true,
 stripeCustomerMatches:true,
 stripeSubscriptionMatches:true,
 trialAlreadyConverted:false,
 existingMemberConflict:false
};
test("requires independently verified payment, subscription and matching identity",()=>{
 assert.equal(assessIsolatedTrialConversion(valid),"ready_to_record");
 for(const key of ["stripeSessionPaid","stripeSubscriptionActive","stripeCustomerMatches","stripeSubscriptionMatches"]){
  assert.equal(assessIsolatedTrialConversion({...valid,[key]:false}),"refuse",key);
 }
 for(const key of ["trialGrantClerkUserId","paymentClerkUserId"]){
  assert.equal(assessIsolatedTrialConversion({...valid,[key]:"user_87654321"}),"refuse",key);
 }
 assert.equal(assessIsolatedTrialConversion({...valid,existingMemberConflict:true}),"refuse");
});
test("conversion idempotency never grants another trial or performs a payment",()=>{
 assert.equal(assessIsolatedTrialConversion({...valid,trialAlreadyConverted:true}),"already_converted");
 assert.equal(assessIsolatedTrialConversion({...valid,stripeSubscriptionActive:false,trialAlreadyConverted:true}),"refuse");
});
