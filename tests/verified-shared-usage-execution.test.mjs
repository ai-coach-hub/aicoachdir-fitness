import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

function load(moduleName,requireMap) {
 const source=readFileSync(new URL("../lib/"+moduleName+".ts",import.meta.url),"utf8");
 const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const mod={exports:{}};
 runInNewContext(js,{module:mod,exports:mod.exports,
  require:(name)=>{assert.ok(name in requireMap,"unexpected import "+name);return requireMap[name];}
 },{timeout:3000});
 return mod.exports;
}
const flow=load("previewLifeUsageFlow",{});
const {executeVerifiedSharedAiRequest:execute}=load("verifiedSharedUsageExecution",{
 "./previewLifeUsageFlow":flow
});
const allowed={allowed:true,memberId:"user_TestMember123",subscriptionKey:"legacy_approved_400",
 periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-11-01T00:00:00.000Z",
 limitUses:400,coach:"fitness",requestKey:"server-approved-12345"};
function run(decision=allowed,meterReserve="reserved",generatorKind="generated"){
 const calls=[];
 const factory=approved=>{calls.push("meter-created");assert.equal(approved,decision);return {
  reserve:async()=>{calls.push("reserved");return meterReserve;},
  settle:async outcome=>{calls.push("settled-"+outcome);return outcome;}
 }};
 const provider=async()=>{calls.push("provider");return generatorKind==="no-model"?
   {kind:"no-model"}:{kind:"generated",value:"synthetic text, no API"};
 };
 return {calls,invoke:()=>execute(async()=>{calls.push("authorized");return decision},factory,provider)};
}

test("verified entitlement reserves then generates then settles exactly once",async()=>{
 const x=run();
 const result=await x.invoke();
 assert.equal(result.status,"completed");
 assert.equal(result.value,"synthetic text, no API");
 assert.deepEqual(x.calls,["authorized","meter-created","reserved","provider","settled-completed"]);
});

test("denied membership or coach prevents reservation and generation",async()=>{
 for(const reason of ["invalid_identity","coach_not_included","billing_unverified","outside_billing_period"]){
  const x=run({allowed:false,reason});
  const result=await x.invoke();
  assert.equal(result.status,"denied");
  assert.deepEqual(x.calls,["authorized"]);
 }
});

test("quota exhaustion, duplicate request and expired allowance cannot call provider",async()=>{
 for(const reason of ["exhausted","duplicate_completed","ineligible"]){
  const x=run(allowed,reason);
  const result=await x.invoke();
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,reason);
  assert.deepEqual(x.calls,["authorized","meter-created","reserved"]);
 }
});

test("non-AI actions release reservation without pretending generation occurred",async()=>{
 const x=run(allowed,"reserved","no-model");
 const result=await x.invoke();
 assert.equal(result.status,"blocked");
 assert.equal(result.reason,"no-model");
 assert.deepEqual(x.calls,["authorized","meter-created","reserved","provider","settled-released"]);
});

test("billing failures cannot fall through into model requests",async()=>{
 let n=0;
 const result=await execute(async()=>{throw Error("Stripe unavailable");},
  ()=>{n++;throw Error("should not run")},
  async()=>{n++;throw Error("should not run")});
 assert.equal(result.status,"denied");
 assert.equal(n,0);
});

test("ambiguous provider failure conservatively retains pending usage",async()=>{
 const events=[];
 const result=await execute(async()=>allowed,()=>({
  reserve:async()=>{events.push("reserve");return "reserved";},
  settle:async out=>{events.push(out);return out;}
 }),async()=>{events.push("provider");throw Error("upstream timeout")});
 assert.equal(result.status,"uncertain");
 assert.deepEqual(events,["reserve","provider","uncertain"]);
});

test("module performs no direct payment or provider network requests",()=>{
 const source=readFileSync(new URL("../lib/verifiedSharedUsageExecution.ts",import.meta.url),"utf8");
 assert.doesNotMatch(source,/\bfetch\(|\bstripeRequest\(|\bneon\(/);
});
