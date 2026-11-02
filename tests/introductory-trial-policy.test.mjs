import test from "node:test";
import assert from "node:assert/strict";
import {INTRODUCTORY_MESSAGE_LIMIT,INTRODUCTORY_ENTITLEMENT,introductoryTrialEligible,
introductoryTrialRemaining,canStartIntroductoryGeneration} from "../lib/introductoryTrialPolicy.ts";
const valid={clerkUserId:"user_verifiedaccount123",emailVerified:true,
 existingPaidOrLegacyMember:false,previouslyGranted:false};
test("introductory grant requires verified identity and is excluded for paid and legacy members",()=>{
 assert.equal(INTRODUCTORY_MESSAGE_LIMIT,15);
 assert.equal(INTRODUCTORY_ENTITLEMENT,"introductory_lifetime_v1");
 assert.equal(introductoryTrialEligible(valid),true);
 for(const property of ["emailVerified","existingPaidOrLegacyMember","previouslyGranted"]){
  assert.equal(introductoryTrialEligible({...valid,[property]:!valid[property]}),false);
 }
 assert.equal(introductoryTrialEligible({...valid,clerkUserId:""}),false);
});
test("lifetime allowance includes pending reservations and never becomes negative",()=>{
 assert.equal(introductoryTrialRemaining(0,0),15);
 assert.equal(introductoryTrialRemaining(7,2),6);
 assert.equal(introductoryTrialRemaining(15,0),0);
 assert.equal(canStartIntroductoryGeneration(14,1),false);
 assert.equal(canStartIntroductoryGeneration(12,2),true);
 for(const values of [[16,0],[-1,0],[0,16],[0,-1],[1.5,2]]){
  assert.throws(()=>introductoryTrialRemaining(...values));
 }
});
