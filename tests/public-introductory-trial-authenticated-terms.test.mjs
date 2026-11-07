import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";

const file=readFileSync(new URL("../app/api/terms-acceptance/route.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(file,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText;
let authenticatedUser=null;
let writes=0;
const mockNextResponse={json:(body,options)=>({body,status:options?.status??200})};
const definitions={
 "next/server":{NextResponse:mockNextResponse},
 "@clerk/nextjs/server":{currentUser:async()=>authenticatedUser},
 "@/lib/termsAcceptance":{
  FITNESS_INCLUDED_USES:400,FITNESS_PLAN:"Membership",FITNESS_PRICE:"$15",
  tierTermsSelection:()=>null,TERMS_ACCEPTANCE_TEXT:"Accepted Terms",
  TERMS_PATH:"/terms",TERMS_SOURCE_PATH:"/fitness/signup",TERMS_VERSION:"current"
 },
 "@/lib/termsAcceptanceDb":{
  ensureTermsAcceptanceSchema:async()=>{writes++;throw Error("Unauthorized access to persistence")}
 },
 "@/lib/newTierCatalog":{newTierSignupsEnabled:()=>false},
 "@/lib/publicIntroductoryTrialAdmission":{publicTrialReleaseGate:()=>true}
};
const module={exports:{}};
new Function("require","module","exports",compiled)(
 name=>{if(!(name in definitions))throw Error("Unexpected dependency: "+name);return definitions[name]},
 module,module.exports
);
const route=module.exports;
const post=(email)=>route.POST(new Request("https://test.example.com/api/terms-acceptance",{
 method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({email,introductoryTrial:true,clientAcceptedAt:new Date().toISOString()})
}));
test("unauthenticated users cannot record a free trial Terms acceptance",async()=>{
 authenticatedUser=null;writes=0;
 const result=await post("trial@example.test");
 assert.equal(result.status,403);
 assert.match(result.body.message,/verified email/);
 assert.equal(writes,0);
});
test("a Clerk login with an unverified email cannot record free trial consent",async()=>{
 authenticatedUser={id:"user_TestConsent12345",primaryEmailAddressId:"mail_1",emailAddresses:[
  {id:"mail_1",emailAddress:"trial@example.test",verification:{status:"unverified"}}
 ]};
 writes=0;
 const result=await post("trial@example.test");
 assert.equal(result.status,403);
 assert.equal(writes,0);
});
test("a verified user cannot record free-trial consent on behalf of another email",async()=>{
 authenticatedUser={id:"user_TestConsent12345",primaryEmailAddressId:"mail_1",emailAddresses:[
  {id:"mail_1",emailAddress:"trial@example.test",verification:{status:"verified"}}
 ]};
 writes=0;
 const result=await post("other@example.test");
 assert.equal(result.status,403);
 assert.equal(writes,0);
});
test("the verified primary email reaches Terms storage; wrong identity never does",async()=>{
 authenticatedUser={id:"user_TestConsent12345",primaryEmailAddressId:"mail_1",emailAddresses:[
  {id:"mail_1",emailAddress:"trial@example.test",verification:{status:"verified"}}
 ]};
 writes=0;
 const result=await post("TRIAL@example.test");
 assert.equal(writes,1);
 assert.equal(result.status,500);
});
