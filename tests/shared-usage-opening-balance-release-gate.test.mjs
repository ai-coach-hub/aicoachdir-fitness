import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const source=read("lib/sharedUsageMeter.ts");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function gate(env){
 const m={exports:{}};
 runInNewContext(compiled,{module:m,exports:m.exports,require:()=>({}),process:{env}}, {timeout:3000});
 return m.exports.sharedUsageGateEnabled();
}
const live={VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true",SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",SHARED_USAGE_CUTOVER_AT:"2026-01-01T00:00:00.000Z"};

test("existing two release switches never reset live billing-period usage without verified opening balances",()=>{
 assert.equal(gate(live),false);
 assert.equal(gate({...live,SHARED_USAGE_OPENING_BALANCES_RECONCILED:"false"}),false);
 assert.equal(gate({...live,SHARED_USAGE_OPENING_BALANCES_RECONCILED:"true"}),true);
});
test("private sandbox gate does not require live billing reconciliation",()=>{
 const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",SHARED_USAGE_GATE_ENABLED:"true"};
 assert.equal(gate(env),true);
 assert.equal(gate({...env,VERCEL_GIT_COMMIT_REF:"main"}),false);
});
test("Life Coach production access, history and generation require reconciled balances",async()=>{
 const life=read("lib/lifeCoachAccess.ts");
 const store=read("lib/lifeCoachStore.ts");
 const chat=read("app/api/life/chat/route.ts");
 assert.match(life,/SHARED_USAGE_OPENING_BALANCES_RECONCILED/);
 assert.ok((store.match(/SHARED_USAGE_OPENING_BALANCES_RECONCILED/g)||[]).length>=2);
 assert.match(chat,/SHARED_USAGE_OPENING_BALANCES_RECONCILED/);
 let clerkCalls=0;
 const js=ts.transpileModule(life,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 runInNewContext(js,{module:m,exports:m.exports,require:name=>{
  assert.equal(name,"@clerk/nextjs/server");
  return {currentUser:async()=>{clerkCalls++;return null}};
 },process:{env:{...live,LIFE_COACH_LIVE_ENABLED:"true"}}},{timeout:3000});
 assert.equal(await m.exports.lifeTester(),null);
 assert.equal(clerkCalls,0,"release must fail closed before looking up any live member");
});
