import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source=readFileSync(new URL("../lib/memberCoachRuntime.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup({verified=true,active=true,reservation="reserved",failProvider=false,missingUser=false}={}){
 const calls=[],member={id:"user_ExistingMember1234",primaryEmailAddressId:"mail1",
  emailAddresses:[{id:"mail1",emailAddress:"verified@example.test",
    verification:{status:verified?"verified":"unverified"}}]};
 const ports={
  "@clerk/nextjs/server":{currentUser:async()=>{calls.push("identity");return missingUser?null:member;}},
  "./fitnessMembershipDb":{memberHasFitnessAccess:async(e,id)=>{
    calls.push("membership");assert.equal(e,"verified@example.test");
    assert.equal(id,member.id);return active;}},
  "./sharedUsageMeter":{
    reserveSharedUsage:async(e,coach,key)=>{calls.push("reserve:"+coach);return {status:reservation};},
    settleSharedUsage:async(e,coach,key,outcome)=>{calls.push("settle:"+outcome);return outcome;}}
 };
 const m={exports:{}};
 runInNewContext(code,{module:m,exports:m.exports,require:key=>{
  assert.ok(Object.hasOwn(ports,key),"Unknown "+key);return ports[key];
 },Date,process:{env:{VERCEL_ENV:"production"}}},{timeout:3000});
 return {calls,run:(coach="life",generation="generated",requestKey="stable-coach-request-00001")=>
  m.exports.runExistingMemberCoachGeneration({
   coach,requestKey,generate:async()=>{
    calls.push("provider");if(failProvider)throw Error("timeout");
    return generation==="generated"?
     {kind:"generated",value:{answer:"Grounded coaching response"}}:{kind:"no-model"};
   }})};
}
test("one gateway enforces verified primary identity and active membership before model or wallet",async()=>{
 for(const opts of [{missingUser:true},{verified:false},{active:false}]){
  const w=setup(opts);const result=await w.run();
  assert.equal(result.status,"blocked");assert.ok(!w.calls.includes("provider"));
  assert.ok(!w.calls.some(x=>x.startsWith("reserve:")));
 }
});
test("Fitness, Budgeting, and Life use the same reserve-then-generate-then-settle sequence",async()=>{
 for(const id of ["fitness","budgeting","life"]){
  const w=setup();const result=await w.run(id);
  assert.equal(result.status,"completed");
  assert.deepEqual(w.calls,["identity","membership","reserve:"+id,"provider","settle:completed"]);
 }
});
test("exhausted and duplicate requests never call the provider",async()=>{
 for(const reservation of ["exhausted","duplicate_completed","pending_renewal"]){
  const w=setup({reservation});const result=await w.run();
  assert.deepEqual(w.calls,["identity","membership","reserve:life"]);
  assert.equal(result.status,"blocked");assert.equal(result.reason,reservation);
 }
});
test("free lookup releases reservation; upstream ambiguity keeps one uncertain reservation",async()=>{
 const free=setup();const first=await free.run("life","no-model");
 assert.equal(first.status,"blocked");assert.deepEqual(free.calls.slice(-2),["provider","settle:released"]);
 const failed=setup({failProvider:true});const second=await failed.run();
 assert.equal(second.status,"uncertain");assert.deepEqual(failed.calls.slice(-2),["provider","settle:uncertain"]);
});
test("malformed client request IDs are rejected before membership and provider calls",async()=>{
 const w=setup();
 const result=await w.run("life","generated","invalid key");
 assert.equal(result.status,"blocked");
 assert.equal(result.reason,"invalid_request");
 assert.deepEqual(w.calls,[]);
});
