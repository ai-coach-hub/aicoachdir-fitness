import test from "node:test";
import assert from "node:assert/strict";
import {executeIsolatedIntroductoryMessage} from "../lib/isolatedIntroductoryExecution.ts";
const account={clerkUserId:"user_verifiedaccount123",memberKey:"member_"+"a".repeat(64),
 emailVerified:true,existingPaidOrLegacyMember:false,previouslyGranted:false};
const request="intro-request-00000001";
function mock(){
 const calls=[];const port={
  grant:async()=>{calls.push("grant");return "granted";},
  reserve:async(_a,coach,key)=>{calls.push("reserve:"+coach+":"+key);return "reserved";},
  settle:async(_a,_coach,_key,outcome)=>{calls.push("settle:"+outcome);return outcome}
 };return {calls,port};
}
test("all three coaches use same verified ledger interface",async()=>{
 for(const coach of ["fitness","budgeting","life"]){
  const {calls,port}=mock();
  const result=await executeIsolatedIntroductoryMessage(account,coach,request,port,async()=>({kind:"generated",value:"ok"}));
  assert.deepEqual(result,{status:"completed",value:"ok"});
  assert.deepEqual(calls,["grant","reserve:"+coach+":"+request,"settle:completed"]);
 }
});
test("paid, unverified and previously granted accounts cannot access trial",async()=>{
 for(const edit of [{emailVerified:false},{existingPaidOrLegacyMember:true}]){
  const {calls,port}=mock();
  const result=await executeIsolatedIntroductoryMessage({...account,...edit},"life",request,port,async()=>({kind:"generated",value:"oops"}));
  assert.equal(result.status,"not_entitled");assert.equal(calls.length,0);
 }
});
test("no-model response releases credit and unknown timeout retains it",async()=>{
 let m=mock();
 assert.equal((await executeIsolatedIntroductoryMessage(account,"fitness",request,m.port,async()=>({kind:"no-model"}))).status,"released");
 assert.equal(m.calls.at(-1),"settle:released");
 m=mock();
 assert.equal((await executeIsolatedIntroductoryMessage(account,"life",request,m.port,async()=>{throw Error("timeout")})).status,"uncertain");
 assert.equal(m.calls.at(-1),"settle:uncertain");
});
test("replay errors do not call model",async()=>{
 const m=mock();m.port.reserve=async()=>"duplicate_completed";
 let called=false;
 const result=await executeIsolatedIntroductoryMessage(account,"budgeting",request,m.port,async()=>{called=true;return {kind:"generated",value:"x"}});
 assert.equal(result.status,"duplicate_completed");assert.equal(called,false);
});

test("prior grant remains spendable but does not create a second grant",async()=>{
 const {calls,port}=mock();port.grant=async()=>{calls.push("existing");return "existing"};
 const result=await executeIsolatedIntroductoryMessage({...account,previouslyGranted:true},"life",request,port,async()=>({kind:"generated",value:"ok"}));
 assert.equal(result.status,"completed");assert.equal(calls[0],"existing");
});
