import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {createHmac,timingSafeEqual} from "node:crypto";
import ts from "typescript";
const source=readFileSync(new URL("../app/api/internal/shared-usage/signature-probe/route.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const secret="only-for-test-usage-service-signature-secret-0001";
function endpoint(env="production"){
 const m={exports:{}};
 runInNewContext(code,{module:m,exports:m.exports,require:n=>{
  assert.equal(n,"node:crypto");return {createHmac,timingSafeEqual};
 },process:{env:{VERCEL_ENV:env,BUDGET_MEMBERSHIP_HANDOFF_SECRET:secret}},
 Date,Buffer,Response},{timeout:3000});
 return m.exports.POST;
}
function sample(){
 return {version:1,audience:"aicoachdir-signature-probe",actor:"budgeting",
  nonce:"0123456789abcdef0123456789abcdef",issuedAt:Date.now()};
}
function request(e,override=""){
 const canonical="aicoachdir-readonly-auth-v1\n"+JSON.stringify([
  e.version,e.audience,e.actor,e.nonce,e.issuedAt
 ]);
 const sig=override||createHmac("sha256",secret).update(canonical).digest("hex");
 return new Request("https://www.aicoachdir.com/api/internal/shared-usage/signature-probe",{
  method:"POST",headers:{"Content-Type":"application/json",
   "x-shared-usage-probe-signature":sig},body:JSON.stringify(e)
 });
}
test("signed read-only production probe succeeds without wallet or billing dependency",async()=>{
 const response=await endpoint()(request(sample()));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,mode:"read-only",verified:"shared-service-signing"});
 assert.doesNotMatch(source,/shared_ai_reserve|stripeRequest|membershipDb/i);
});
test("invalid signatures, stale clocks, changed payload, malformed and preview requests fail closed",async()=>{
 const e=sample();
 assert.equal((await endpoint()(request(e,"f".repeat(64)))).status,401);
 assert.equal((await endpoint()(request({...e,issuedAt:e.issuedAt-120001}))).status,401);
 const fake={...e,actor:"fitness"};
 assert.equal((await endpoint()(request(fake))).status,401);
 assert.equal((await endpoint("preview")(request(e))).status,404);
});
