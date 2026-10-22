import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/sharedAiEntitlementPolicy.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module = {exports:{}};
runInNewContext(js,{module,exports:module.exports},{timeout:3000});
const {decideSharedAiUsage} = module.exports;
const period = (start="2026-10-01T00:00:00.000Z",end="2026-11-01T00:00:00.000Z") =>
  ({periodStart:start,periodEnd:end});
const snapshot = (overrides={}) => ({
 clerkUserId:"user_accountA1234",
 stripeCustomerId:"cus_Customer1",
 stripeSubscriptionId:"sub_Subscription1",
 stripeStatus:"active",
 cancelAtPeriodEnd:false,
 verifiedAt:"2026-10-21T11:55:00.000Z",
 ...period(),
 allowanceLedgerKey:"approved_fitness_v2_legacy",
 includedUses:400,
 allowedCoaches:["fitness","budgeting"],
 ...overrides
});
const request = (overrides={}) => ({
 authenticatedClerkUserId:"user_accountA1234",
 coach:"fitness",
 requestKey:"verified-request-abc123",
 now:"2026-10-21T12:00:00.000Z",
 ...overrides
});
const judge=(s={},r={})=>decideSharedAiUsage(snapshot(s),request(r));

test("existing 400-use legacy allowance stays explicitly Fitness and Budgeting only",()=>{
 const a=judge();
 assert.equal(a.allowed,true);
 assert.equal(a.limitUses,400);
 assert.equal(a.subscriptionKey,"approved_fitness_v2_legacy");
 assert.equal(a.memberId,"user_accountA1234");
 assert.equal(judge({}, {coach:"budgeting"}).allowed,true);
 assert.deepEqual({ ...judge({}, {coach:"life"}) }, {allowed:false,reason:"coach_not_included"});
 assert.equal(judge({}, {coach:"career"}).reason,"coach_not_included");
});

test("cancel at period end retains access before expiry and never resets uses",()=>{
 const s={cancelAtPeriodEnd:true};
 assert.equal(judge(s).allowed,true);
 assert.equal(judge(s,{now:"2026-10-31T23:59:59.999Z"}).reason,"billing_unverified"); // stale verification
 const near={...s,verifiedAt:"2026-10-31T23:58:00.000Z"};
 assert.equal(judge(near,{now:"2026-10-31T23:59:59.999Z"}).allowed,true);
 assert.equal(judge({...near,verifiedAt:"2026-11-01T00:00:00.000Z"},
   {now:"2026-11-01T00:00:00.000Z"}).reason,"outside_billing_period");
});

test("canceled, recoverable, paused, unpaid and incomplete subscriptions do not mint AI uses",()=>{
 for(const stripeStatus of ["canceled","past_due","unpaid","paused","incomplete","incomplete_expired"]){
   assert.deepEqual({...judge({stripeStatus})},{allowed:false,reason:"subscription_inactive"});
 }
 assert.equal(judge({stripeStatus:"trialing"}).allowed,true);
});

test("reactivation in the SAME period preserves stable allowance despite new subscription ID",()=>{
 const before=judge();
 const after=judge({stripeSubscriptionId:"sub_NewSubscription2"});
 assert.equal(before.allowed,true);
 assert.equal(after.allowed,true);
 assert.equal(after.subscriptionKey,before.subscriptionKey);
 assert.equal(after.periodStart,before.periodStart);
 assert.equal(after.limitUses,before.limitUses);
});

test("renewal resets on legitimate new period only after prior period ends",()=>{
 const prior={clerkUserId:"user_accountA1234",allowanceLedgerKey:"approved_fitness_v2_legacy",...period()};
 const next = snapshot({...period("2026-11-01T00:00:00.000Z","2026-12-01T00:00:00.000Z"),
   verifiedAt:"2026-11-01T00:01:00.000Z"});
 const out=decideSharedAiUsage(next,request({now:"2026-11-01T00:02:00.000Z",priorPeriod:prior}));
 assert.equal(out.allowed,true);
 assert.equal(out.periodStart,next.periodStart);
 assert.equal(out.subscriptionKey,prior.allowanceLedgerKey);
});

test("reactivation and upgrade cannot double grant with an overlapping period or rekey",()=>{
 const old={clerkUserId:"user_accountA1234",allowanceLedgerKey:"approved_fitness_v2_legacy",...period()};
 const overlap={...period("2026-10-15T00:00:00.000Z","2026-11-15T00:00:00.000Z")};
 assert.equal(judge(overlap,{priorPeriod:old}).reason,"overlapping_period");
 assert.equal(judge({allowanceLedgerKey:"unapproved_upgrade_same_period"},{priorPeriod:old}).reason,"overlapping_period");
 assert.equal(judge({stripeSubscriptionId:"sub_NewSubscription2"},{priorPeriod:old}).allowed,true);
 assert.equal(judge({}, {priorPeriod:{...old,clerkUserId:"user_someoneelse"}}).reason,"invalid_identity");
});

test("identity mismatch, malformed request key, and missing plan approval fail closed",()=>{
 assert.equal(judge({}, {authenticatedClerkUserId:"user_otherAccount"}).reason,"invalid_identity");
 assert.equal(judge({}, {requestKey:"short"}).reason,"invalid_identity");
 assert.equal(judge({stripeCustomerId:"not_verified"}).reason,"invalid_identity");
 assert.equal(judge({stripeSubscriptionId:"something"}).reason,"invalid_identity");
 for(const s of [
   {allowanceLedgerKey:""},
   {includedUses:0}, {includedUses:10001}, {includedUses:200.5},
   {allowedCoaches:[]}, {allowedCoaches:["life","unknown"]}
 ]) assert.equal(judge(s).reason,"unapproved_entitlement");
});

test("absent, stale, future or malformed server billing verification cannot grant access",()=>{
 for(const s of [
   {verifiedAt:"2026-10-21T11:30:00.000Z"},
   {verifiedAt:"2026-10-21T12:03:00.000Z"},
   {verifiedAt:"invalid"},
   {periodStart:"2026-10-01"},
   {periodStart:"2026-02-30T00:00:00.000Z"},
   {periodEnd:"2026-09-30T00:00:00.000Z"},
   {periodEnd:"2027-01-01T00:00:00.000Z"}
 ]) assert.equal(judge(s).reason,"billing_unverified",JSON.stringify(s));
 assert.equal(judge({}, {now:"not-a-date"}).reason,"billing_unverified");
});

test("a valid subscription only grants uses within verified paid billing boundaries",()=>{
 const base={verifiedAt:"2026-10-01T00:00:00.000Z"};
 assert.equal(judge(base,{now:"2026-09-30T23:59:59.999Z"}).reason,"outside_billing_period"==="outside_billing_period"?"billing_unverified":"invalid"); // future verification denied
 const within={verifiedAt:"2026-10-01T00:01:00.000Z"};
 assert.equal(judge(within,{now:"2026-10-01T00:02:00.000Z"}).allowed,true);
 assert.equal(judge({verifiedAt:"2026-11-01T00:00:00.000Z"},{now:"2026-11-01T00:00:00.000Z"}).reason,"outside_billing_period");
});
