import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const raw=readFileSync(new URL("../lib/sharedUsageMeter.ts",import.meta.url),"utf8");
const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const day=86400000,now=Date.now(),oldStart=new Date(now-5*day).toISOString(),
  nextEnd=new Date(now+24*day).toISOString(),launch=new Date(now-day).toISOString(),
  earlierLaunch=new Date(now-15*day).toISOString();
const memberKey="member_"+"a".repeat(64);

function world({periodStart=oldStart,cutover=launch,mode="rolling_renewal",opening="false",memberPresent=true,memberActive=true}={}){
 const calls=[];
 const sql=async(strings,...values)=>{
  const stmt=strings.join("?");
  calls.push({stmt,values});
  if(stmt.includes("current_setting"))return [{branch_id:"br-sparkling-glitter-aucpz59d"}];
  if(stmt.includes("SELECT config_value"))return [{config_value:"price_Approved"}];
  if(stmt.includes("FROM public.shared_ai_usage_periods"))return [];
  if(stmt.includes("SELECT public.shared_ai_reserve"))return [{status:"reserved"}];
  throw Error("Unexpected SQL "+stmt.slice(0,150));
 };
 let lookups=0;
 const record={access_active:memberActive,stripe_status:"active",stripe_customer_id:"cus_Verified",stripe_subscription_id:"sub_Verified"};
 const dependencies={
  "./fitnessMembershipDb":{membershipDb:()=>sql,
    getFitnessMembership:async()=>memberPresent?record:null,
    memberHasFitnessAccess:async()=>{lookups++;return true;}},
  "./stripeServer":{stripeRequest:async path=>path.startsWith("/customers/")?
    {email:"member@example.test",deleted:false}:
    {id:"sub_Verified",customer:"cus_Verified",status:"active"}},
  "./stripeUsagePeriod":{stripeUsageWindowFromVerifiedRecord:()=>({ok:true,periodStart,periodEnd:nextEnd})},
  "./sharedUsageMemberIdentity":{sharedUsageMemberKey:()=>memberKey},
  "./sharedUsagePriceApproval":{approvedSharedPriceIds:()=>["price_Approved"]}
 };
 const env={VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true",
  SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",SHARED_USAGE_OPENING_BALANCES_RECONCILED:opening,
  SHARED_USAGE_CUTOVER_AT:cutover,SHARED_USAGE_MIGRATION_MODE:mode,
  BUDGET_MEMBERSHIP_HANDOFF_SECRET:"x".repeat(40)};
 const mod={exports:{}};
 runInNewContext(code,{module:mod,exports:mod.exports,process:{env},Date,
  require:id=>{assert.ok(Object.hasOwn(dependencies,id),id);return dependencies[id];},
  console:{error:()=>{}}},{timeout:3000});
 return {gate:()=>mod.exports.sharedUsageGateEnabled(),
  reserve:()=>mod.exports.reserveSharedUsage("member@example.test","fitness","fitness-request-00000001"),
  calls,get lookups(){return lookups}};
}
test("explicit forward-only migration can go live without fabricating opening balances",()=>{
 const w=world();
 assert.equal(w.gate(),true);
 assert.equal(world({mode:""}).gate(),false);
 assert.equal(world({mode:"rolling_renewal",cutover:"not-a-date"}).gate(),false);
 assert.equal(world({mode:"rolling_renewal",opening:"false"}).gate(),true);
});
test("a current billing period predating cutover remains on the existing service without claiming fresh quota",async()=>{
 const w=world();
 assert.equal((await w.reserve()).status,"pending_renewal");
 assert.equal(w.calls.some(x=>x.stmt.includes("shared_ai_reserve")),false);
});
test("after real renewal a verified member moves automatically to the same 400-use ledger",async()=>{
 const w=world({cutover:earlierLaunch});
 const result=await w.reserve();
 assert.equal(result.status,"reserved");
 assert.equal(result.permit?.limitUses,400);
 assert.equal(w.calls.some(x=>x.stmt.includes("shared_ai_reserve")),true);
});
test("unrecognized or inactive members never receive quota without independent access proof",async()=>{
 for(const args of [{memberPresent:false},{memberActive:false}]){
  const w=world(args);
  const result=await w.reserve();
  assert.notEqual(result.status,"reserved");
 }
});
