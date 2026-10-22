import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const raw=readFileSync(new URL("../lib/gatedFitnessChat.ts",import.meta.url),"utf8");
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(reserveStatus){
 let realCalls=0;
 let settlements=0;
 const modules={
  "@clerk/nextjs/server":{currentUser:async()=>({id:"user_Verified12345",
    primaryEmailAddressId:"email_1",emailAddresses:[{id:"email_1",emailAddress:"legitimate@example.test",verification:{status:"verified"}}]})},
  "./fitnessMembershipDb":{memberHasFitnessAccess:async()=>true},
  "./sharedUsageMeter":{reserveSharedUsage:async()=>({status:reserveStatus}),
    settleSharedUsage:async()=>{settlements++;return "completed";}}
 };
 const m={exports:{}};
 runInNewContext(js,{module:m,exports:m.exports,process:{env:{VERCEL_ENV:"production"}},
  require:k=>{assert.ok(Object.hasOwn(modules,k),k);return modules[k]},
  Response:{json:(body,opts={})=>({status:opts.status||200,body})}
 },{timeout:3000});
 const req={clone:()=>({json:async()=>({message:"Hello",requestKey:"fitness-verified-00000001"})})};
 return {perform:()=>m.exports.gatedFitnessChat(req,async()=>{realCalls++;return{status:200}}),
 get realCalls(){return realCalls},get settlements(){return settlements}};
}
test("existing verified member stays on old Fitness path until individual renewal",async()=>{
 const h=harness("pending_renewal");
 const response=await h.perform();
 assert.equal(response.status,200);
 assert.equal(h.realCalls,1);
 assert.equal(h.settlements,0,"old provider calls must not claim shared AI usage");
});
test("a member with no verified allowance cannot bypass the shared meter",async()=>{
 const h=harness("not_entitled");
 const response=await h.perform();
 assert.notEqual(response.status,200);
 assert.equal(h.realCalls,0);
});
