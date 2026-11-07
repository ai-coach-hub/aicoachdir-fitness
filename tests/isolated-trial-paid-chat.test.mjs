import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const verify=read("../lib/isolatedPaidContinuation.ts");
const paid=read("../app/api/isolated-introductory-trial/paid-chat/route.ts");
const check=read("../app/api/isolated-introductory-trial/paid-continuation-readiness/route.ts");
const migration=read("../sql/isolated-paid-continuation.sql");
test("verified TEST subscription and paid invoice precede paid wallet or provider request",()=>{
 assert.match(verify,/assertIsolatedTrialTestCheckout\(\)/);
 assert.match(verify,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(verify,/intro_trial_preview/);
 assert.match(verify,/invoice\.status!=="paid"/);
 assert.match(verify,/invoice\.livemode!==false/);
 assert.match(verify,/sub\.livemode!==false/);
 assert.match(verify,/sharedUsageMemberKey/);
 assert.match(verify,/TEST_MONTHLY_ALLOWANCE=200/);
 assert.match(paid,/verifiedIsolatedPaidContinuation\(\)/);
 assert.ok(paid.indexOf("verifiedIsolatedPaidContinuation()")<paid.indexOf("shared_ai_reserve("));
 assert.ok(paid.indexOf("shared_ai_reserve(")<paid.indexOf('https://api.pickaxe.co'));
 assert.doesNotMatch(paid,/stripeRequest\(|saveFitnessMembership\(|grantFitnessAccess\(/);
});
test("paid history persists before settlement and one shared wallet covers all three coaches",()=>{
 assert.match(paid,/isCoach\(coach\)/);
 assert.match(paid,/shared_ai_reserve\(/);
 assert.match(paid,/shared_ai_settle\(/);
 assert.match(paid,/outcome="uncertain"/);
 assert.match(paid,/status===/);
});
test("readiness is read-only and never creates wallet or calls provider",()=>{
 assert.match(check,/verifiedIsolatedPaidContinuation\(\)/);
 assert.match(check,/paidMessagesReady:true/);
 assert.doesNotMatch(check,/INSERT INTO|UPDATE public|DELETE FROM|shared_ai_reserve|api\.pickaxe\.co/);
});
test("paid ledger history has foreign key and is isolated from trial history",()=>{
 assert.match(migration,/FOREIGN KEY\(member_key,entitlement_key,period_start,request_key\)/);
 assert.match(migration,/introductory_paid_history/);
 assert.match(paid,/ON CONFLICT DO NOTHING RETURNING request_key/);
 assert.ok(paid.indexOf("INSERT INTO public.introductory_paid_history")<paid.indexOf("shared_ai_settle("));
});
