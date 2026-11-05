import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const file=readFileSync(new URL("../lib/publicIntroductoryTrialAdmission.ts",import.meta.url),"utf8");
const js=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports",js)(mod,mod.exports);
const {assessPublicTrialAdmission:admit,publicTrialReleaseGate:gate}=mod.exports;
const evidence=()=>({
 clerkId:"user_FirstTimeTrial1234",verifiedEmail:"new@example.test",emailOwnershipVerified:true,
 currentTermsAccepted:true,memberKey:"member_"+"a".repeat(64),
 exactActiveMembership:"none",historicalStripe:"none",historicalPickaxe:"none",
 lifetimeTrial:"never",trialSchemaVerified:true,coachProvidersReady:true,sharedMeterReady:true
});
test("verified first-time user with all services available receives one new trial",()=>{
 assert.deepEqual(admit(evidence()),{kind:"new",reason:"verified_new_member"});
 assert.deepEqual(admit({...evidence(),lifetimeTrial:"in_progress"}),{kind:"resume",reason:"existing_lifetime_trial"});
});
test("past and present paid or grandfathered users never receive another free trial",()=>{
 for(const type of ["paid","legacy","recoverable"]){
  assert.equal(admit({...evidence(),exactActiveMembership:type}).reason,"existing_member");
 }
 for(const type of ["paid","recoverable"]){
  assert.equal(admit({...evidence(),historicalStripe:type}).reason,"existing_member");
 }
 assert.equal(admit({...evidence(),historicalPickaxe:"legacy"}).reason,"existing_member");
});
test("exhaustion or paid conversion is irreversible through admission",()=>{
 assert.deepEqual(admit({...evidence(),lifetimeTrial:"exhausted"}),{kind:"deny",reason:"trial_exhausted"});
 assert.deepEqual(admit({...evidence(),lifetimeTrial:"converted"}),{kind:"deny",reason:"trial_converted"});
});
test("missing verified owner identity or agreement cannot admit a trial",()=>{
 assert.equal(admit({...evidence(),emailOwnershipVerified:false}).reason,"unverified_identity");
 assert.equal(admit({...evidence(),clerkId:"someone_else"}).reason,"unverified_identity");
 assert.equal(admit({...evidence(),verifiedEmail:"NOT-VERIFIED@example.test"}).reason,"unverified_identity");
 assert.equal(admit({...evidence(),memberKey:"not-a-member"}).reason,"unverified_identity");
 assert.equal(admit({...evidence(),currentTermsAccepted:false}).reason,"terms_required");
});
test("provider uncertainty fails closed without creating a free grant",()=>{
 for(const key of ["exactActiveMembership","historicalStripe","historicalPickaxe","lifetimeTrial"]){
  assert.equal(admit({...evidence(),[key]:"unavailable"}).kind,"unavailable");
 }
 for(const key of ["trialSchemaVerified","coachProvidersReady","sharedMeterReady"]){
  assert.equal(admit({...evidence(),[key]:false}).reason,"infrastructure_not_ready");
 }
});
test("the public release requires all explicit gates in production",()=>{
 const enabled={
  VERCEL_ENV:"production",PUBLIC_INTRO_TRIAL_ENABLED:"true",
  PUBLIC_INTRO_TRIAL_RELEASE_APPROVED:"true",PUBLIC_INTRO_TRIAL_METER_READY:"true",
  PUBLIC_INTRO_TRIAL_THREE_COACHES_READY:"true",PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED:"true"
 };
 assert.equal(gate(enabled),true);
 for(const key of Object.keys(enabled)){
  assert.equal(gate({...enabled,[key]:undefined}),false,key);
 }
 assert.equal(gate({...enabled,VERCEL_ENV:"preview"}),false);
});
