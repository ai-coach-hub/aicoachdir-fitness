import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const sqlSchema=readFileSync(new URL("../migrations/20261022_coach_conversations.sql",import.meta.url),"utf8");
const code=ts.transpileModule(
 readFileSync(new URL("../lib/coachConversationStore.ts",import.meta.url),"utf8"),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText;
test("future coaches share member-scoped, atomic, idempotent conversation storage without touching existing histories",()=>{
 assert.match(sqlSchema,/CREATE TABLE IF NOT EXISTS public\.coach_conversation_threads/);
 assert.match(sqlSchema,/CREATE TABLE IF NOT EXISTS public\.coach_conversation_turns/);
 assert.match(sqlSchema,/PRIMARY KEY \(coach_key,member_id,thread_id\)/);
 assert.match(sqlSchema,/FOREIGN KEY \(coach_key,member_id,thread_id\)/);
 assert.match(sqlSchema,/CREATE OR REPLACE FUNCTION public\.coach_conversation_save/);
 assert.match(sqlSchema,/pg_advisory_xact_lock/);
 assert.match(sqlSchema,/IF FOUND THEN[\s\S]*?RETURN 'duplicate'/);
 assert.match(sqlSchema,/RETURN 'conflict'/);
 assert.match(sqlSchema,/REVOKE ALL ON FUNCTION public\.coach_conversation_save/);
});

function fixture({branch="br-sparkling-glitter-aucpz59d"}={}){
 const calls=[];
 const sql=async(strings,...args)=>{
  const q=strings.join("?");
  calls.push({q,args});
  if(q.includes("current_setting"))return [{branch_id:branch}];
  if(q.includes("public.coach_conversation_save"))return [{result:"saved"}];
  if(q.includes("FROM public.coach_conversation_threads"))return [{thread_id:"thread_ABCDEF1234567890",created_at:new Date().toISOString()}];
  if(q.includes("FROM public.coach_conversation_turns"))return [{request_key:"request_ABCDEF1234567890",user_text:"Goal",assistant_text:"Plan",created_at:new Date().toISOString()}];
  throw Error("Unrecognized SQL "+q.slice(0,140));
 };
 const obj={exports:{}};
 runInNewContext(code,{module:obj,exports:obj.exports,process:{env:{VERCEL_ENV:"production"}},
  require:key=>{
   assert.equal(key,"./fitnessMembershipDb");
   return {membershipDb:()=>sql};
  },Date},{timeout:3000});
 return {...obj.exports,calls};
}
const args={coach:"career",memberId:"user_StoredMember123456",threadId:"thread_ABCDEF1234567890",
 requestKey:"request_ABCDEF1234567890",message:"Goal",response:"Plan"};
test("save accepts an additional coach without adding a new chat table",async()=>{
 const f=fixture();assert.equal(await f.saveCoachConversationTurn(args),"saved");
 assert.ok(f.calls.some(x=>x.q.includes("public.coach_conversation_save")&&x.args.includes("career")));
});
test("chat reads and lists always include both coach and member identity, with production branch verification",async()=>{
 const f=fixture();
 assert.equal((await f.listCoachConversationThreads("career",args.memberId)).length,1);
 assert.equal((await f.readCoachConversationThread("career",args.memberId,args.threadId)).length,1);
 const queries=f.calls.filter(x=>x.q.includes("FROM public.coach_conversation_"));
 assert.equal(queries.length,2);
 for(const q of queries){
  assert.ok(q.q.includes("member_id=") && q.q.includes("coach_key="));
  assert.ok(q.args.includes("career") && q.args.includes(args.memberId));
 }
});
test("wrong Neon branch and invalid identity block before any history change",async()=>{
 const f=fixture({branch:"br-preview-other"});
 await assert.rejects(()=>f.saveCoachConversationTurn(args),/branch mismatch/);
 assert.ok(!f.calls.some(x=>x.q.includes("coach_conversation_save")));
 const other=fixture();assert.equal(await other.saveCoachConversationTurn({...args,memberId:"not-clerk"}),"invalid");
 assert.deepEqual(other.calls,[]);
});
