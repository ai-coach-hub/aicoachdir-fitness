import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const src=readFileSync(new URL("../lib/previewLifeUsageFlow.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports,require:()=>{throw Error("Unexpected dependency");}});
const {runMeteredPreviewGeneration}=mod.exports;

function fixture(reserve="reserved"){
 const settled=[];
 let calls=0;
 return {
  settled,
  generated:()=>calls,
  port:{reserve:async()=>reserve,settle:async value=>{settled.push(value);return value;}},
  generate:async()=>{calls++;return {kind:"generated",value:"Life plan"};}
 };
}

test("one successful new generated answer reserves and completes one use",async()=>{
 const x=fixture();
 const result=await runMeteredPreviewGeneration(x.port,x.generate);
 assert.equal(result.status,"completed");
 assert.equal(result.value,"Life plan");
 assert.equal(x.generated(),1);
 assert.deepEqual(x.settled,["completed"]);
});

test("exhausted or duplicate requests never contact the model",async()=>{
 for(const reason of ["exhausted","ineligible","duplicate_reserved","duplicate_completed","duplicate_uncertain","released"]){
  const x=fixture(reason);
  const result=await runMeteredPreviewGeneration(x.port,x.generate);
  assert.equal(result.status,"blocked");
  assert.equal(result.reason,reason);
  assert.equal(x.generated(),0);
  assert.deepEqual(x.settled,[]);
 }
});

test("pre-model cancellation releases the reserved request",async()=>{
 const x=fixture();
 const result=await runMeteredPreviewGeneration(x.port,async()=>({kind:"no-model"}));
 assert.equal(result.status,"blocked");
 assert.equal(result.reason,"no-model");
 assert.deepEqual(x.settled,["released"]);
});

test("ambiguous provider failure is held for reconciliation",async()=>{
 const x=fixture();
 const result=await runMeteredPreviewGeneration(x.port,async()=>{throw Error("upstream timeout");});
 assert.equal(result.status,"uncertain");
 assert.deepEqual(x.settled,["uncertain"]);
});

test("settlement failure never reports a chargeable completion as settled",async()=>{
 const x=fixture();
 x.port.settle=async value=>{x.settled.push(value);return "missing";};
 const result=await runMeteredPreviewGeneration(x.port,x.generate);
 assert.equal(result.status,"uncertain");
 assert.deepEqual(x.settled,["completed"]);
});
