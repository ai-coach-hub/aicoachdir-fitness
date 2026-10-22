import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source=readFileSync(new URL("../lib/sharedUsageMeter.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const email="grandfathered@example.test";
const clerkId="user_LegacyExample12345";
const base=()=>({email,clerk_user_id:clerkId,stripe_status:"legacy_pickaxe_member",
 access_active:true,stripe_customer_id:null,stripe_subscription_id:null,
 last_legacy_verified_at:null});
function verifyFixture({row=base(),verified=true,env="production",onCheck}={}){
 const calls=[];
 let membership={...row};
 const mod={exports:{}};
 const now=Date.now();
 const dependencies={
  "./fitnessMembershipDb":{
   getFitnessMembership:async()=>{
    calls.push("read");return membership;
   },
   memberHasFitnessAccess:async(memberEmail,id)=>{
    calls.push("verify");
    assert.equal(memberEmail,email);
    assert.equal(id,clerkId);
    if(onCheck)await onCheck();
    if(verified)membership={...membership,last_legacy_verified_at:new Date(now-60000).toISOString()};
    return verified;
   },
   membershipDb:()=>{throw Error("No Neon writes in unit test")}
  },
  "./stripeServer":{stripeRequest:async()=>{throw Error("No Stripe network in unit test")}},
  "./stripeUsagePeriod":{stripeUsageWindowFromVerifiedRecord:()=>({ok:false})},
  "./sharedUsageMemberIdentity":{sharedUsageMemberKey:()=> "member_"+"a".repeat(64)},
  "./sharedUsagePriceApproval":{approvedSharedPriceIds:()=>[]}
 };
 runInNewContext(js,{
  module:mod,exports:mod.exports,require:name=>{
   assert.ok(name in dependencies,"Unexpected dependency: "+name);
   return dependencies[name];
  },
  Date,
  process:{env:{
   VERCEL_ENV:env,
   SHARED_USAGE_GATE_ENABLED:"true",
   SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",
   BUDGET_MEMBERSHIP_HANDOFF_SECRET:"s".repeat(48),
   SHARED_USAGE_LEGACY_PERIOD_MODE:"utc_calendar"
  }}
 },{timeout:3000});
 return {calls,verify:()=>mod.exports.resolveCurrentSharedUsage(email)};
}

test("previously approved grandfathered user with stale billing timestamp is revalidated before getting one 400-use wallet",async()=>{
 const s=verifyFixture();
 const outcome=await s.verify();
 assert.equal(outcome?.limitUses,400);
 assert.equal(outcome?.entitlementKey,"existing_400_v1");
 assert.equal(outcome?.memberKey,"member_"+"a".repeat(64));
 assert.deepEqual(s.calls,["read","verify","read"]);
});

test("grandfathered entitlement cannot be renewed when member verification fails",async()=>{
 const s=verifyFixture({verified:false});
 assert.equal(await s.verify(),null);
 assert.deepEqual(s.calls,["read","verify"]);
});

test("legacy records without a stable bound Clerk identity never gain fresh allowance",async()=>{
 const s=verifyFixture({row:{...base(),clerk_user_id:null}});
 assert.equal(await s.verify(),null);
 assert.deepEqual(s.calls,["read"]);
});

test("current non-Stripe member recheck cannot revive a revoked membership",async()=>{
 const s=verifyFixture({onCheck:async()=>{} ,verified:false});
 assert.equal(await s.verify(),null);
});

test("already recently verified grandfathered accounts avoid extra billing lookups",async()=>{
 const fresh=new Date(Date.now()-120000).toISOString();
 const s=verifyFixture({row:{...base(),last_legacy_verified_at:fresh}});
 assert.equal((await s.verify())?.limitUses,400);
 assert.deepEqual(s.calls,["read"]);
});

test("preview never executes live grandfathered membership refresh",async()=>{
 const s=verifyFixture({env:"preview"});
 assert.equal(await s.verify(),null);
 assert.deepEqual(s.calls,[]);
});
