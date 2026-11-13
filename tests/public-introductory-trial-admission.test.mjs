import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const filename=new URL("../lib/publicIntroductoryTrialAdmission.ts",import.meta.url);
const source=readFileSync(filename,"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports",js)(mod,mod.exports);
const {assessPublicTrialAdmission:admit,publicTrialReleaseGate:gate}=mod.exports;
const verified=()=>({
  clerkId:"user_VerifiedTesting123",verifiedEmail:"trial@example.test",
  emailOwnershipVerified:true,currentTermsAccepted:true,
  memberKey:"member_"+ "a".repeat(64),exactActiveMembership:"none",
  historicalStripe:"none",historicalPickaxe:"none",lifetimeTrial:"never",
  trialSchemaVerified:true,coachProvidersReady:true,sharedMeterReady:true
});
test("server evidence admits a genuinely new user and only one lifetime grant",()=>{
 assert.deepEqual(admit(verified()),{kind:"new",reason:"verified_new_member"});
 assert.deepEqual(admit({...verified(),lifetimeTrial:"in_progress"}),{kind:"resume",reason:"existing_lifetime_trial"});
 assert.deepEqual(admit({...verified(),lifetimeTrial:"exhausted"}),{kind:"deny",reason:"trial_exhausted"});
 assert.deepEqual(admit({...verified(),lifetimeTrial:"converted"}),{kind:"deny",reason:"trial_converted"});
});
test("paid and grandfathered members are not ever placed into trials",()=>{
 for(const exactActiveMembership of ["paid","legacy","recoverable"])
  assert.equal(admit({...verified(),exactActiveMembership}).kind,"deny");
 for(const historicalStripe of ["paid","recoverable"])
  assert.equal(admit({...verified(),historicalStripe}).kind,"deny");
 assert.equal(admit({...verified(),historicalPickaxe:"legacy"}).kind,"deny");
});
test("unknown lookups never masquerade as no prior payment or trial",()=>{
 for(const field of ["exactActiveMembership","historicalStripe","historicalPickaxe","lifetimeTrial"]){
  assert.equal(admit({...verified(),[field]:"unavailable"}).kind,"unavailable");
 }
});
test("only verified identity, accepted terms, durable schema and all three coaches may start",()=>{
 assert.equal(admit({...verified(),emailOwnershipVerified:false}).kind,"deny");
 assert.equal(admit({...verified(),verifiedEmail:"not-normalized@EXAMPLE.test"}).kind,"deny");
 assert.equal(admit({...verified(),currentTermsAccepted:false}).kind,"deny");
 assert.equal(admit({...verified(),trialSchemaVerified:false}).kind,"unavailable");
 assert.equal(admit({...verified(),coachProvidersReady:false}).kind,"unavailable");
 assert.equal(admit({...verified(),sharedMeterReady:false}).kind,"unavailable");
});
test("release gate defaults OFF even on production, and cannot activate in preview",()=>{
 assert.equal(gate({VERCEL_ENV:"production"}),false);
 assert.equal(gate({VERCEL_ENV:"production",PUBLIC_INTRO_TRIAL_ENABLED:"true",PUBLIC_INTRO_TRIAL_RELEASE_APPROVED:"true",PUBLIC_INTRO_TRIAL_METER_READY:"true",PUBLIC_INTRO_TRIAL_THREE_COACHES_READY:"true"}),false);
 assert.equal(gate({VERCEL_ENV:"preview",PUBLIC_INTRO_TRIAL_ENABLED:"true",PUBLIC_INTRO_TRIAL_RELEASE_APPROVED:"true",PUBLIC_INTRO_TRIAL_METER_READY:"true",PUBLIC_INTRO_TRIAL_THREE_COACHES_READY:"true",PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED:"true"}),false);
 assert.equal(gate({VERCEL_ENV:"production",PUBLIC_INTRO_TRIAL_ENABLED:"true",PUBLIC_INTRO_TRIAL_RELEASE_APPROVED:"true",PUBLIC_INTRO_TRIAL_METER_READY:"true",PUBLIC_INTRO_TRIAL_THREE_COACHES_READY:"true",PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED:"true"}),true);
});
test("no billing, database writes or coach-provider calls in eligibility evaluator",()=>{
 assert.doesNotMatch(source,/stripeRequest\(|fetch\(|currentUser\(|INSERT INTO|UPDATE public|DELETE FROM|grantFitnessAccess|reserveSharedUsage\(/);
});
