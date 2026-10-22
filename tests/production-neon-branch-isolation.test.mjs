import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const live = {
  VERCEL_ENV:"production",
  SHARED_USAGE_GATE_ENABLED:"true",
  SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",
  SHARED_USAGE_OPENING_BALANCES_RECONCILED:"true",
  LIFE_COACH_LIVE_ENABLED:"true",
  DATABASE_URL:"postgresql://synthetic.invalid/private-test",
  BUDGET_MEMBERSHIP_HANDOFF_SECRET:"synthetic-internal-test-secret"
};
const PROD_BRANCH="br-sparkling-glitter-aucpz59d";
const PREVIEW_BRANCH="br-autumn-breeze-auw38rgr";

function load(path,env,deps){
  const source=readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  runInNewContext(js,{module,exports:module.exports,require:(name)=>{
    assert.ok(Object.hasOwn(deps,name),"Unexpected import "+name);
    return deps[name];
  },process:{env},Date,console:{error:()=>{}}},{timeout:3000});
  return module.exports;
}
function lifeStore({branch=PROD_BRANCH,env=live}={}){
  const calls=[];
  const sql=async(strings,...args)=>{
    const query=strings.join(" ? ");calls.push({query,args});
    if(query.includes("current_setting("))return [{branch_id:branch}];
    if(query.includes("SELECT id,title,updated_at FROM life_chat_threads"))
      return [{id:"life-coach-demo_01234567",title:"Private check",updated_at:"2026-10-22T00:00:00Z"}];
    throw Error("Unrecognized SQL");
  };
  const api=load("lib/lifeCoachStore.ts",env,{
    "./lifeCoachMemory":{selectLifeMemories:()=>[]},
    "@neondatabase/serverless":{neon:()=>sql}
  });
  return {api,calls};
}
function wallet({branch=PROD_BRANCH,env=live}={}){
  const calls=[];
  const sql=async(strings,...args)=>{
    const query=strings.join(" ? ");calls.push({query,args});
    if(query.includes("current_setting("))return [{branch_id:branch}];
    if(query.includes("SELECT config_value FROM public.billing_config"))
      return [{config_value:"price_Approved123"}];
    throw Error("Unexpected SQL");
  };
  const api=load("lib/sharedUsageMeter.ts",env,{
    "./fitnessMembershipDb":{
      membershipDb:()=>sql,
      getFitnessMembership:async()=>({
        access_active:true,stripe_status:"active",
        stripe_customer_id:"cus_Verified123",
        stripe_subscription_id:"sub_Verified123"
      }),
      memberHasFitnessAccess:async()=>true
    },
    "./stripeServer":{stripeRequest:async(path)=>{
      if(path.startsWith("/customers/"))return {email:"member@example.test",deleted:false};
      if(path.startsWith("/subscriptions/"))return {
        id:"sub_Verified123",customer:"cus_Verified123",status:"active"
      };
      throw Error("Unexpected Stripe lookup");
    }},
    "./stripeUsagePeriod":{stripeUsageWindowFromVerifiedRecord:()=>({
      ok:true,periodStart:new Date(Date.now()-86400000).toISOString(),
      periodEnd:new Date(Date.now()+86400000).toISOString()
    })},
    "./sharedUsageMemberIdentity":{sharedUsageMemberKey:()=> "member_"+ "a".repeat(64)},
    "./sharedUsagePriceApproval":{approvedSharedPriceIds:()=>["price_Approved123"]}
  });
  return {api,calls};
}

test("production Life Coach rejects a preview Neon URL before reading history",async()=>{
  const x=lifeStore({branch:PREVIEW_BRANCH});
  await assert.rejects(x.api.listLifeThreads("user_Synthetic123"),/production.*branch mismatch/i);
  assert.equal(x.calls.length,1);
  assert.match(x.calls[0].query,/current_setting/);
});
test("production Life Coach accepts the expected main branch after verifying it",async()=>{
  const x=lifeStore();
  const threads=await x.api.listLifeThreads("user_Synthetic123");
  assert.equal(threads.length,1);
  assert.equal(x.calls.length,2);
  assert.match(x.calls[0].query,/current_setting/);
});
test("production Life Coach requires all release gates before any database call",async()=>{
  const x=lifeStore({env:{...live,LIFE_COACH_LIVE_ENABLED:"false"}});
  await assert.rejects(x.api.listLifeThreads("user_Synthetic123"),/disabled/);
  assert.equal(x.calls.length,0);
});
test("production shared wallet rejects a preview Neon URL before reading its billing config",async()=>{
  const x=wallet({branch:PREVIEW_BRANCH});
  await assert.rejects(x.api.resolveCurrentSharedUsage("member@example.test"),/production.*branch mismatch/i);
  assert.equal(x.calls.length,1);
  assert.match(x.calls[0].query,/current_setting/);
});
test("production shared wallet resolves a verified period on the correct Neon branch",async()=>{
  const x=wallet();
  const permit=await x.api.resolveCurrentSharedUsage("member@example.test");
  assert.equal(permit.limitUses,400);
  assert.equal(permit.entitlementKey,"existing_400_v1");
  assert.equal(x.calls.length,2);
  assert.match(x.calls[0].query,/current_setting/);
});
test("shared wallet disabled means no database or Stripe lookup",async()=>{
  const x=wallet({env:{...live,SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"false"}});
  assert.equal(await x.api.resolveCurrentSharedUsage("member@example.test"),null);
  assert.equal(x.calls.length,0);
});
