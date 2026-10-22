import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const raw=readFileSync(new URL("../lib/lifeExistingMembershipEligibility.ts",import.meta.url),"utf8");
const js=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};runInNewContext(js,{module:m,exports:m.exports},{timeout:3000});
const judge=m.exports.classifyExistingLifeMembership;
const member=()=>({email:"member@example.test",clerk_user_id:"user_Member12345678",stripe_customer_id:"cus_Original",stripe_subscription_id:"sub_Original",stripe_status:"active",access_active:true});
const identity={clerkUserId:"user_Member12345678",verifiedPrimaryEmail:"member@example.test"};
test("linked subscribers retain one shared 400-use entitlement only after server billing confirmation",()=>{
 const m=member();
 const ok=judge(m,identity,{linkedSubscriptionActive:true});
 assert.equal(ok.eligible,true);assert.equal(ok.kind,"linked");assert.equal(ok.monthlyUses,400);
 assert.equal(judge(m,identity,{}).reason,"billing_verification_required");
 assert.equal(judge({...m,stripe_subscription_id:null},identity,{linkedSubscriptionActive:true}).eligible,false);
});
test("approved historically verified legacy members are eligible without a new Stripe charge",()=>{
 const m={...member(),stripe_customer_id:null,stripe_subscription_id:null,stripe_status:"legacy_pickaxe_member"};
 const ok=judge(m,identity,{verifiedHistoricalLegacyAccess:true});
 assert.equal(ok.eligible,true);assert.equal(ok.kind,"verified_legacy");assert.equal(ok.monthlyUses,400);
 assert.equal(judge(m,identity,{}).reason,"legacy_verification_required");
 assert.equal(judge({...m,stripe_status:"random"},identity,{verifiedHistoricalLegacyAccess:true}).eligible,false);
});
test("other accounts, unverified identities, inactive and lapsed subscriptions do not gain Life",()=>{
 const m=member();
 assert.equal(judge(m,{...identity,clerkUserId:"user_Other12345678"},{linkedSubscriptionActive:true}).reason,"identity_mismatch");
 assert.equal(judge(m,{...identity,verifiedPrimaryEmail:"other@example.test"},{linkedSubscriptionActive:true}).reason,"identity_mismatch");
 assert.equal(judge({...m,access_active:false},identity,{linkedSubscriptionActive:true}).reason,"inactive");
 assert.equal(judge(null,identity,{linkedSubscriptionActive:true}).eligible,false);
});
test("resolver never makes billing or database calls or changes existing subscription",()=>{
 assert.doesNotMatch(raw,/\bfetch\(|\bstripeRequest\(|\bneon\(|\bINSERT\b|\bUPDATE\b/);
});
