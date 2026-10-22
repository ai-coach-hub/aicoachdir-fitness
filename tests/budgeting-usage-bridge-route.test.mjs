import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,timingSafeEqual} from "node:crypto";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {runInNewContext} from "node:vm";

const get=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const authJs=ts.transpileModule(get("lib/budgetUsageServiceAuth.ts"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const auth={exports:{}};
runInNewContext(authJs,{module:auth,exports:auth.exports,Buffer,require:()=>({createHmac,timingSafeEqual})},{timeout:3000});
const sign=auth.exports.signBudgetUsageCommand;
const hubSrc=get("app/api/life/budgeting-usage-bridge/route.ts");
const hubJs=ts.transpileModule(hubSrc,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const secret="x".repeat(48),email="tester@example.test";
const command=(overrides={})=>({version:1,email,coach:"budgeting",operation:"reserve",
 requestKey:"budget-member-request-123456789",issuedAt:Math.floor(Date.now()/1000),...overrides});
function environment(config={}){
 const calls=[];
 const env={PREVIEW_SHARED_USAGE_METER_ENABLED:"true",LIFE_COACH_TESTER_EMAILS:email,
  BUDGET_MEMBERSHIP_HANDOFF_SECRET:secret,...config};
 const mocks={
  "@/lib/budgetUsageServiceAuth":auth.exports,
  "@/lib/fitnessMembershipDb":{getFitnessMembership:async member=>{
   calls.push(["membership",member]);return {access_active:true,
    stripe_status:"active",clerk_user_id:"user_Approved1234567"};
  }},
  "@/lib/previewLifeTestEnrollment":{
   previewTestAvailable:()=>env.PREVIEW_SHARED_USAGE_METER_ENABLED==="true",
   lifeTestStatus:async member=>{calls.push(["enrollment",member]);return {active:true}},
   previewLifeTestPeriod:"2026-10-20T00:00:00.000Z",
   previewLifeTestSubscription:"preview-shared-three-use-20261020"
  },
  "@/lib/previewAiUsage":{
   reservePreviewAiUse:async usage=>{calls.push(["reserve",usage]);return "reserved"},
   settlePreviewAiUse:async(usage,outcome)=>{calls.push(["settle",usage,outcome]);return outcome}
  }
 };
 const mod={exports:{}};
 runInNewContext(hubJs,{module:mod,exports:mod.exports,require:id=>{
  if(!(id in mocks))throw Error("Unexpected module "+id);
  return mocks[id];
 },process:{env},Response,Request,Date,Math},{timeout:3000});
 const send=async(body,sig=sign(body,secret))=>{
  const response=await mod.exports.POST(new Request("https://private.example.test/api/life/budgeting-usage-bridge",{
   method:"POST",headers:{"Content-Type":"application/json","x-budget-usage-signature":sig},
   body:JSON.stringify(body)
  }));
  return {status:response.status,data:await response.json()};
 };
 return {calls,send};
}
test("authenticated Budgeting request uses existing Clerk-owned shared preview ledger",async()=>{
 const e=environment(),cmd=command();
 const reserved=await e.send(cmd);
 assert.equal(reserved.status,200);
 assert.equal(reserved.data.status,"reserved");
 assert.deepEqual(e.calls.map(x=>x[0]),["membership","enrollment","reserve"]);
 assert.equal(e.calls[2][1].memberId,"user_Approved1234567");
 assert.equal(e.calls[2][1].coach,"budgeting");
 const settled=await e.send(command({operation:"settle",outcome:"completed"}));
 assert.equal(settled.status,200);assert.equal(settled.data.status,"completed");
 assert.deepEqual(e.calls.map(x=>x[0]),["membership","enrollment","reserve","membership","enrollment","settle"]);
});
test("forged signatures, non-testers and inactive preview gate cannot reserve",async()=>{
 const a=environment();
 const forged=await a.send(command({email:"other@example.test"}));
 assert.equal(forged.status,403);assert.equal(a.calls.length,0);
 const tampered=await a.send(command(),"f".repeat(64));
 assert.equal(tampered.status,401);assert.equal(a.calls.length,0);
 const off=environment({PREVIEW_SHARED_USAGE_METER_ENABLED:"false"});
 const reply=await off.send(command());
 assert.equal(reply.status,404);assert.equal(off.calls.length,0);
});
test("private endpoint never calls providers or alters Stripe prices",()=>{
 assert.doesNotMatch(hubSrc,/\bfetch\(|\bstripeRequest\(|\bgrantFitnessAccess\(|\bcreateCheckoutSession\(/);
 assert.match(hubSrc,/previewTestAvailable\(\)/);
 assert.match(hubSrc,/lifeTestStatus\(memberId\)/);
});
