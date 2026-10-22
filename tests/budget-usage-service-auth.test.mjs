import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,timingSafeEqual} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../lib/budgetUsageServiceAuth.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};
runInNewContext(compiled,{module:m,exports:m.exports,require:()=>({createHmac,timingSafeEqual}),Buffer},{timeout:3000});
const {signBudgetUsageCommand:sign,verifyBudgetUsageCommand:verify}=m.exports;
const secret="S".repeat(48),now=1792684800;
const base={version:1,email:"private@example.test",coach:"budgeting",operation:"reserve",requestKey:"usage-request-123456789",issuedAt:now};
test("matching signed private Budget request is accepted without disclosing quotas in payload",()=>{
 const signature=sign(base,secret);
 assert.equal(verify(base,signature,secret,now),true);
 assert.equal(JSON.stringify(base).includes("limitUses"),false);
});
test("forged email, operation, outcome, key and timestamp fail authentication",()=>{
 const sig=sign(base,secret);
 for(const change of [{email:"other@example.test"},{operation:"settle",outcome:"completed"},{requestKey:"other-request-123456789"},{issuedAt:now-200},{coach:"fitness"},{operation:"reconcile"}]){
  assert.equal(verify({...base,...change},sig,secret,now),false,JSON.stringify(change));
 }
 assert.equal(verify(base,"0".repeat(64),secret,now),false);
 assert.equal(verify(base,sig,"short",now),false);
 assert.equal(verify(base,sig,secret,now+121),false);
});
test("settle requires a signed status and cannot be redirected to release arbitrary uses",()=>{
 const settle={...base,operation:"settle",outcome:"completed"};
 const sig=sign(settle,secret);
 assert.equal(verify(settle,sig,secret,now),true);
 assert.equal(verify({...settle,outcome:"released"},sig,secret,now),false);
 assert.equal(verify({...settle,outcome:"unknown"},sig,secret,now),false);
});
