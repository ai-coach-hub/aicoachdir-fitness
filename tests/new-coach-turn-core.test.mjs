import test from "node:test";
import assert from "node:assert/strict";
import {runNewCoachTurn,summarizeProviderCalls} from "../lib/newCoachTurnCore.mjs";
const metrics=[{attempts:1,costUsd:.02,inputTokens:100,outputTokens:50},{attempts:2,costUsd:.04,inputTokens:200,outputTokens:40}];
test("one customer reply can include several provider attempts",()=>{
 assert.deepEqual(summarizeProviderCalls(metrics),{providerCalls:3,costUsd:.06,inputTokens:300,outputTokens:90});
 assert.equal(summarizeProviderCalls([{attempts:1,costUsd:null,inputTokens:4,outputTokens:2}]).costUsd,null);
 assert.equal(summarizeProviderCalls([{attempts:1,costUsd:-1,inputTokens:4,outputTokens:2}]),null);
});
test("unauthorized or exhausted member does not generate",async()=>{
 let invoked=0;
 const p={authorize:async()=>({ok:false}),reserve:async()=>{invoked++},generate:async()=>{invoked++},
 settle:async()=>{invoked++},saveTurn:async()=>{invoked++}};
 assert.equal((await runNewCoachTurn(p)).reason,"not_authorized");
 assert.equal(invoked,0);
 assert.equal((await runNewCoachTurn({...p,authorize:async()=>({ok:true}),reserve:async()=> "exhausted"})).reason,"exhausted");
 assert.equal(invoked,0); // Reserve returned exhausted without calling provider or storage.
});
test("records durable history before spending allowance",async()=>{
 const calls=[]; const identity={ok:true,memberId:"synthetic"};
 const result=await runNewCoachTurn({
 authorize:async()=>identity,reserve:async()=>{calls.push("reserve");return "reserved";},
 generate:async()=>{calls.push("generate");return {kind:"generated",reply:"Plan complete",calls:metrics}},
 saveTurn:async()=>{calls.push("save");return "saved";},settle:async(out)=>{calls.push(out);return out;},
 observe:async()=>{calls.push("observe")},
 });
 assert.equal(result.status,"completed");
 assert.deepEqual(calls,["reserve","generate","save","completed","observe"]);
});
test("storage failure leaves request uncertain rather than refunding or double billing",async()=>{
 const events=[];
 const result=await runNewCoachTurn({authorize:async()=>({ok:true}),reserve:async()=>"reserved",
 generate:async()=>({kind:"generated",reply:"response",calls:metrics}),
 saveTurn:async()=>{throw Error("storage unavailable");},
 settle:async(out)=>{events.push(out);return out;}});
 assert.equal(result.status,"uncertain");
 assert.deepEqual(events,["uncertain"]);
});
test("invalid/missing provider cost cannot be treated as zero",async()=>{
 const x=summarizeProviderCalls([{attempts:1,costUsd:null,inputTokens:null,outputTokens:null}]);
 assert.equal(x.costUsd,null);assert.equal(x.inputTokens,null);
});

test("conflicting or unverified persistence never settles completed",async()=>{
 for(const result of ["conflict","invalid",undefined]){
  const events=[];
  const outcome=await runNewCoachTurn({
   authorize:async()=>({ok:true}),reserve:async()=>"reserved",
   generate:async()=>({kind:"generated",reply:"reply",calls:metrics}),
   saveTurn:async()=>result,settle:async(kind)=>{events.push(kind);return kind;}
  });
  assert.equal(outcome.status,"uncertain");
  assert.deepEqual(events,["uncertain"]);
 }
});
