import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../lib/previewSharedCounterSimulation.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/life/shared-counter-qa/route.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;

const calls=[],requests=[];
const shared={remaining:2,reservations:new Set()};
const module={exports:{}};
runInNewContext(compiled,{module,exports:module.exports,require:(id)=>{
 if(id==="./previewLifeTestEnrollment")return {
  previewLifeTestSubscription:"preview-shared-three-use-20261020",
  previewLifeTestPeriod:"2026-10-20T00:00:00.000Z"
 };
 if(id==="./previewAiUsage")return {
  reservePreviewAiUse:async(v)=>{
   calls.push({kind:"reserve",...v});
   if(shared.reservations.has(v.requestKey))return "duplicate_completed";
   if(shared.remaining<=0)return "exhausted";
   shared.remaining--;shared.reservations.add(v.requestKey);return "reserved";
  },
  settlePreviewAiUse:async(v,status)=>{
   calls.push({kind:"settle",status,...v});return status;
  }
 };
 if(id==="./previewLifeUsageFlow")return {
  runMeteredPreviewGeneration:async(port,generate)=>{
   const reserved=await port.reserve();
   if(reserved!=="reserved")return {status:"blocked",reason:reserved};
   const generated=await generate();
   const settled=await port.settle("completed");
   return settled==="completed"?{status:"completed",value:generated.value}:{status:"uncertain"};
  }
 };
 throw Error("Unexpected import "+id);
}}, {timeout:3000});
const {simulateSharedPreviewUse:simulate}=module.exports;
const account="user_PrivateSandbox123";

test("Fitness, Budgeting and Life share one simulated cap; retries cannot take extra uses",async()=>{
 const a=await simulate({memberId:account,coach:"fitness",requestKey:"synthetic-fitness-00001"});
 const b=await simulate({memberId:account,coach:"budgeting",requestKey:"synthetic-budget-00002"});
 const c=await simulate({memberId:account,coach:"life",requestKey:"synthetic-life-0000003"});
 assert.equal(a.status,"completed");
 assert.equal(b.status,"completed");
 assert.equal(c.status,"blocked");
 assert.equal(c.reason,"exhausted");
 assert.equal((await simulate({memberId:account,coach:"fitness",requestKey:"synthetic-fitness-00001"})).reason,"duplicate_completed");
 assert.equal(shared.remaining,0);
 assert.equal(calls.filter(x=>x.kind==="settle").length,2);
 assert.equal(new Set(calls.map(x=>x.subscriptionKey)).size,1);
 assert.equal(new Set(calls.map(x=>x.periodStart)).size,1);
});

test("invalid coaches and request keys never touch the ledger",async()=>{
 const before=calls.length;
 assert.equal((await simulate({memberId:account,coach:"career",requestKey:"synthetic-career-00004"})).status,"invalid");
 assert.equal((await simulate({memberId:account,coach:"fitness",requestKey:"short"})).status,"invalid");
 assert.equal(calls.length,before);
});

test("private QA endpoint cannot call real coach providers or mutate live billing",()=>{
 assert.match(route,/lifeTester\(\)/);
 assert.match(route,/previewTestAvailable\(\)/);
 assert.match(route,/lifeTestStatus\(member\)/);
 assert.doesNotMatch(route,/fetch\(|stripeRequest\(|pickaxe|memberHasFitnessAccess|grantFitnessAccess/);
 assert.doesNotMatch(source,/fetch\(|stripeRequest\(|pickaxe|INSERT INTO|UPDATE /i);
});
