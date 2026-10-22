import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const text=readFileSync(new URL("../lib/sharedUsageMeter.ts",import.meta.url),"utf8");
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const now=Date.now(),day=86400000;
const begin=new Date(now-5*day).toISOString();
const ending=new Date(now+25*day).toISOString();
const midCutover=new Date(now-day).toISOString();
const oldCutover=new Date(now-15*day).toISOString();
const walletMember="member_"+"a".repeat(64);

function scenario({cutover=midCutover,seed=null,periodStart=begin,periodEnd=ending}={}){
 const dbCalls=[];
 const sql=async(strings,...values)=>{
  const query=strings.join("?");
  dbCalls.push(query);
  if(query.includes("current_setting"))return [{branch_id:"br-sparkling-glitter-aucpz59d"}];
  if(query.includes("SELECT config_value FROM public.billing_config"))return [{config_value:"price_ExistingPlan"}];
  if(query.includes("FROM public.shared_ai_usage_periods")){
   return seed===null?[]:[{period_end:seed.periodEnd||periodEnd,limit_uses:seed.limitUses??400,
    completed_uses:seed.completed??0,reserved_uses:seed.reserved??0}];
  }
  throw Error("Unexpected SQL "+query.slice(0,150));
 };
 const dependencies={
  "./fitnessMembershipDb":{
   membershipDb:()=>sql,
   getFitnessMembership:async()=>({access_active:true,stripe_status:"active",
    stripe_customer_id:"cus_Existing123",stripe_subscription_id:"sub_Existing123"})
  },
  "./stripeServer":{stripeRequest:async path=>path.startsWith("/customers/")?
    {email:"member@example.test",deleted:false}:
    {id:"sub_Existing123",customer:"cus_Existing123",status:"active"}},
  "./stripeUsagePeriod":{stripeUsageWindowFromVerifiedRecord:()=>({ok:true,periodStart,periodEnd})},
  "./sharedUsageMemberIdentity":{sharedUsageMemberKey:()=>walletMember},
  "./sharedUsagePriceApproval":{approvedSharedPriceIds:()=>["price_ExistingPlan"]}
 };
 const mod={exports:{}};
 const env={VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true",
  SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",SHARED_USAGE_OPENING_BALANCES_RECONCILED:"true",
  BUDGET_MEMBERSHIP_HANDOFF_SECRET:"t".repeat(48),...(cutover?{SHARED_USAGE_CUTOVER_AT:cutover}:{})};
 runInNewContext(js,{module:mod,exports:mod.exports,require:p=>{
  assert.ok(p in dependencies,"Unexpected import "+p);return dependencies[p];
 },process:{env},Date,console:{error:()=>{}}},{timeout:3000});
 return {access:()=>mod.exports.resolveCurrentSharedUsage("member@example.test"),
  gate:()=>mod.exports.sharedUsageGateEnabled(),dbCalls};
}
test("production cannot enable the shared meter without a valid immutable launch cutover date",()=>{
 assert.equal(scenario({cutover:null}).gate(),false);
 assert.equal(scenario({cutover:"yesterday"}).gate(),false);
 assert.equal(scenario().gate(),true);
});
test("existing subscriber period overlapping cutover is blocked until a seeded wallet row exists",async()=>{
 const x=scenario({seed:null});
 assert.equal(await x.access(),null);
 assert.ok(x.dbCalls.some(x=>x.includes("FROM public.shared_ai_usage_periods")));
});
test("reconciled period permits the exact verified seeded wallet without minting another balance",async()=>{
 const x=scenario({seed:{completed:37,reserved:0}});
 const permit=await x.access();
 assert.equal(permit?.limitUses,400);
 assert.equal(permit?.periodStart,begin);
});
test("wrong seeded wallet period or allowance cannot grant new quota",async()=>{
 for(const seed of [{periodEnd:new Date(now+26*day).toISOString(),completed:4},
  {limitUses:800,completed:4},{completed:401},{completed:380,reserved:25}]){
  const x=scenario({seed});assert.equal(await x.access(),null);
 }
});
test("new billing period beginning after cutover can start fresh without historical seeding",async()=>{
 const x=scenario({cutover:oldCutover,seed:null});
 const permit=await x.access();
 assert.equal(permit?.limitUses,400);
 assert.ok(!x.dbCalls.some(x=>x.includes("FROM public.shared_ai_usage_periods")));
});
