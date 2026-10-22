import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source=readFileSync(new URL("../lib/previewAiUsage.ts",import.meta.url),"utf8");
function load(env, actualBranch="br-autumn-breeze-auw38rgr"){
  const calls=[];
  const sql=async (parts,...values)=>{
    const statement=parts.join(" ? ");
    calls.push({statement,values});
    if(statement.includes("current_setting('neon.branch_id'")) return [{branch_id:actualBranch}];
    if(statement.includes("preview_ai_reserve")) return [{result:"reserved"}];
    if(statement.includes("preview_ai_settle")) return [{result:"completed"}];
    if(statement.includes("preview_ai_reconcile")) return [{result:"released"}];
    throw Error("Unexpected query");
  };
  const module={exports:{}};
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled,{module,exports:module.exports,require:(name)=>{
    assert.equal(name,"@neondatabase/serverless");
    return {neon:(url)=>{assert.equal(url,env.LIFE_COACH_DATABASE_URL);return sql;}};
  },process:{env}}, {timeout:3000});
  return {api:module.exports,calls};
}
const member={
  memberId:"clerk-preview-member-A",subscriptionKey:"synthetic-preview-only",
  periodStart:"2026-10-01T00:00:00.000Z",
  requestKey:"preview-unique-request-0001",coach:"life"
};
const preview=()=>({
 VERCEL_ENV:"preview",
 VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",
 PREVIEW_SHARED_USAGE_METER_ENABLED:"true",
 LIFE_COACH_DATABASE_URL:"postgresql://synthetic.invalid/demo"
});

test("the adapter defaults to disabled and never connects to a database",async()=>{
 for(const override of [
  {PREVIEW_SHARED_USAGE_METER_ENABLED:undefined},
  {VERCEL_ENV:"production"},
  {VERCEL_GIT_COMMIT_REF:"main"},
  {LIFE_COACH_DATABASE_URL:undefined}
 ]){
  const {api,calls}=load({...preview(),...override});
  await assert.rejects(api.reservePreviewAiUse(member));
  assert.equal(calls.length,0);
 }
});

test("invalid data cannot be sent to Neon",async()=>{
 const {api,calls}=load(preview());
 assert.equal(await api.reservePreviewAiUse({...member,requestKey:"x"}),"invalid");
 assert.equal(await api.reservePreviewAiUse({...member,coach:"unknown"}),"invalid");
 assert.equal(await api.reservePreviewAiUse({...member,periodStart:"not-a-date"}),"invalid");
 assert.equal(calls.length,0);
});

test("reserve, settle and reconcile use server-provided identity and one request key",async()=>{
 const {api,calls}=load(preview());
 assert.equal(await api.reservePreviewAiUse(member),"reserved");
 assert.equal(await api.settlePreviewAiUse(member,"completed"),"completed");
 assert.equal(await api.reconcilePreviewAiUse(member,"released"),"released");
 assert.equal(calls.length,6);
 assert.ok(calls.filter(c=>c.statement.includes("preview_ai_")).every(c=>c.values[0]===member.memberId));
 assert.ok(calls.filter(c=>c.statement.includes("preview_ai_")).every(c=>c.values[1]===member.subscriptionKey));
 assert.ok(calls.filter(c=>c.statement.includes("preview_ai_")).every(c=>c.values[3]===member.requestKey));
 assert.ok(calls[1].statement.includes("preview_ai_reserve"));
 assert.ok(calls[3].statement.includes("preview_ai_settle"));
 assert.ok(calls[5].statement.includes("preview_ai_reconcile"));
});

test("the adapter does not perform AI requests or log customer message content",async()=>{
 const {api,calls}=load(preview());
 await api.reservePreviewAiUse(member);
 assert.equal(calls.length,2);
 assert.ok(!JSON.stringify(calls).includes("member message"));
});

test("wrong Neon branch blocks all shared usage mutations",async()=>{
 const {api,calls}=load(preview(),"br-unexpected");
 await assert.rejects(api.reservePreviewAiUse(member),/branch mismatch/);
 await assert.rejects(api.settlePreviewAiUse(member,"completed"),/branch mismatch/);
 await assert.rejects(api.reconcilePreviewAiUse(member,"released"),/branch mismatch/);
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.statement.includes("current_setting('neon.branch_id'")));
});
