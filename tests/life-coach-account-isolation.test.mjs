import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
function moduleFrom(path, deps={}, globals={}) {
 const compiled=ts.transpileModule(source(path),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText;
 const module={exports:{}};
 const require=(name)=>{
  if(!Object.hasOwn(deps,name))throw new Error("Unexpected module: "+name);
  return deps[name];
 };
 runInNewContext(compiled,{module,exports:module.exports,require,...globals},{timeout:3000,filename:path});
 return module.exports;
}
function mockLifeEnvironment(){
 const threads=[];
 const messages=[];
 const traces=[];
 let serial=0;
 let signedInMember=null;
 let databaseBranch="br-autumn-breeze-auw38rgr";
 let providerCalls=0;
 let mockProviderEnabled=false;
 let lastProviderRequest=null;
 const fakeSql=async(parts,...values)=>{
  const query=parts.join(" ? ").trim();
  traces.push({query,values});
  if(query.includes("current_setting('neon.branch_id'"))
    return [{branch_id:databaseBranch}];
  if(query.startsWith("CREATE TABLE IF NOT EXISTS"))return [];
  if(query.startsWith("WITH thread AS (") && query.includes("INSERT INTO life_chat_messages")){
   const [member,id,title,question,answer]=values;
   const existing=threads.find(t=>t.member_id===member&&t.id===id);
   if(existing){existing.updated_at=new Date().toISOString();}
   else threads.push({member_id:member,id,title,updated_at:new Date().toISOString()});
   messages.push({id:++serial,member_id:member,conversation_id:id,role:"user",body:question,created_at:new Date().toISOString()});
   messages.push({id:++serial,member_id:member,conversation_id:id,role:"assistant",body:answer,created_at:new Date().toISOString()});
   return [];
  }
  if(query.startsWith("INSERT INTO life_chat_threads")){
   const [member,id,title]=values;
   const existing=threads.find(t=>t.member_id===member&&t.id===id);
   if(existing){existing.updated_at=new Date().toISOString();}
   else threads.push({member_id:member,id,title,updated_at:new Date().toISOString()});
   return [];
  }
  if(query.startsWith("INSERT INTO life_chat_messages")){
   const [member,conversation_id,body]=values;
   const role=query.includes("'user'")?"user":query.includes("'assistant'")?"assistant":"";
   if(!role)throw Error("Missing fixture role");
   if(!threads.some(t=>t.member_id===member&&t.id===conversation_id))throw Error("Tenant FK violated");
   messages.push({id:++serial,member_id:member,conversation_id,role,body,created_at:new Date().toISOString()});
   return [];
  }
  if(query.startsWith("SELECT id,title,updated_at FROM life_chat_threads")){
   const [member]=values;
   return threads.filter(t=>t.member_id===member).slice().sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,50);
  }
  if(query.startsWith("SELECT id FROM life_chat_threads")){
   const [member,id]=values;
   return threads.filter(t=>t.member_id===member&&t.id===id).slice(0,1);
  }
  if(query.startsWith("SELECT role,body,created_at FROM life_chat_messages")){
   const [member,id]=values;
   return messages.filter(m=>m.member_id===member&&m.conversation_id===id).slice(0,200);
  }
  if(query.startsWith("SELECT body,created_at FROM life_chat_messages")){
   const [member,currentId]=values;
   const goalOnly=query.includes("AND (lower(body) LIKE");
   const goalWords=["my goal","my priority","i want to","i plan to","i am trying","i aim to","i would like","working on"];
   return messages.filter(m=>m.member_id===member&&m.conversation_id!==currentId&&m.role==="user")
    .filter(m=>!goalOnly||goalWords.some(w=>m.body.toLowerCase().includes(w)))
    .slice().sort((a,b)=>b.id-a.id).slice(0,goalOnly?40:80);
  }
  throw Error("Unrecognized query: "+query.slice(0,180));
 };
 const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",LIFE_COACH_DATABASE_URL:"postgresql://private.invalid",PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN:"unused-in-isolation-tests"};
 const memory=moduleFrom("lib/lifeCoachMemory.ts");
 const formatting=moduleFrom("lib/lifeCoachFormatting.ts");
 const store=moduleFrom("lib/lifeCoachStore.ts",{
  "./lifeCoachMemory":memory,
  "@neondatabase/serverless":{neon:(url)=>{
   assert.equal(url,env.LIFE_COACH_DATABASE_URL);
   return fakeSql;
  }}
 },{process:{env}});
 const route=moduleFrom("app/api/life/chat/route.ts",{
  "@/lib/lifeCoachFormatting":formatting,
  "@/lib/lifeCoachMemory":memory,
  "@/lib/lifeCoachAccess":{lifeTester:async()=>signedInMember},
  "@/lib/lifeCoachStore":store
 },{
  process:{env},Request,Response,URL,AbortSignal,
  crypto:{randomUUID:()=>"ffffffff-1111-2222-3333-444444444444"},
  fetch:async(url,options)=>{
   providerCalls++;
   if(!mockProviderEnabled)throw Error("This privacy test must not call Pickaxe");
   assert.equal(url,"https://api.pickaxe.co/v1/completions");
   lastProviderRequest=JSON.parse(options.body);
   return new Response(JSON.stringify({response:"Here is your practical coaching plan."}),{
    status:200,headers:{"Content-Type":"application/json"}
   });
  }
 });
 const apiGet=async(path)=>{
  const res=await route.GET(new Request("https://private.test/api/life/chat"+path));
  return {status:res.status,data:await res.json()};
 };
 const apiPost=async(body)=>{
  const res=await route.POST(new Request("https://private.test/api/life/chat",{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  }));
  return {status:res.status,data:await res.json()};
 };
 return {store,threads,messages,traces,apiGet,apiPost,
  signIn:(id)=>{signedInMember=id},
  setDatabaseBranch:(id)=>{databaseBranch=id},
  providerCalls:()=>providerCalls,
  enableMockProvider:()=>{mockProviderEnabled=true},
  providerPayload:()=>lastProviderRequest
 };
}
const memberA="test-clerk-member-a";
const memberB="test-clerk-member-b";
const threadA="life-coach-owner-a-12345678";
const threadB="life-coach-owner-b-12345678";
const factA="My goal this month is to improve my time management.";
const factB="My goal this month is to learn watercolor painting.";

test("two separate Clerk owners cannot list, read, or recall each other's saved Life Coach messages",async()=>{
 const e=mockLifeEnvironment();
 await e.store.saveLifeTurn(memberA,threadA,factA,"Let's work on time management.");
 await e.store.saveLifeTurn(memberB,threadB,factB,"Let's work on painting.");
 assert.equal(e.messages.length,4);
 assert.equal(e.messages.filter(m=>m.role==="user").length,2);
 const listA=await e.store.listLifeThreads(memberA);
 const listB=await e.store.listLifeThreads(memberB);
 assert.equal(listA.length,1);
 assert.equal(listA[0].id,threadA);
 assert.equal(listB.length,1);
 assert.equal(listB[0].id,threadB);
 assert.equal(await e.store.readLifeThread(memberB,threadA),null);
 assert.equal(await e.store.readLifeThread(memberA,threadB),null);
 assert.equal((await e.store.readLifeThread(memberB,threadB)).length,2);
 const recalledA=await e.store.recallLifeStatements(memberA,"","What goal did I tell you earlier?");
 const recalledB=await e.store.recallLifeStatements(memberB,"","What goal did I tell you earlier?");
 assert.ok(recalledA.some(e=>e.text===factA),"A recall: "+JSON.stringify({recalledA,traces:e.traces.slice(-3)}));
 assert.ok(recalledB.some(e=>e.text===factB),"B recall: "+JSON.stringify({recalledB,traces:e.traces.slice(-3)}));
 assert.ok(!recalledA.some(e=>e.text.includes("watercolor")));
 assert.ok(!recalledB.some(e=>e.text.includes("time management")));
});
test("GET API ignores forged member_id and rejects a different member's conversation ID",async()=>{
 const e=mockLifeEnvironment();
 await e.store.saveLifeTurn(memberA,threadA,factA,"Saved A");
 await e.store.saveLifeTurn(memberB,threadB,factB,"Saved B");
 e.signIn(memberB);
 const list=await e.apiGet("?member_id="+memberA);
 assert.equal(list.status,200);
 assert.equal(list.data.threads.length,1);
 assert.equal(list.data.threads[0].id,threadB);
 const foreign=await e.apiGet("?id="+threadA+"&member_id="+memberA);
 assert.equal(foreign.status,404);
 assert.equal(foreign.data.ok,false);
 const own=await e.apiGet("?id="+threadB);
 assert.equal(own.status,200);
 assert.equal(own.data.messages[0].text,factB);
 assert.ok(!JSON.stringify(own.data).includes(factA));
 const proof=await e.apiGet("?recall=goal&member_id="+memberA);
 assert.equal(proof.status,200);
 assert.equal(proof.data.found,true);
 assert.ok(proof.data.response.includes("watercolor painting"));
 assert.ok(!proof.data.response.includes("time management"));
 assert.equal(e.providerCalls(),0);
});
test("POST cannot append to another member's thread or use forged identity and costs no model credits",async()=>{
 const e=mockLifeEnvironment();
 await e.store.saveLifeTurn(memberA,threadA,factA,"Saved A");
 await e.store.saveLifeTurn(memberB,threadB,factB,"Saved B");
 e.signIn(memberB);
 const previousCount=e.messages.length;
 const foreign=await e.apiPost({
  conversationId:threadA,message:"What goal did I tell you about earlier?",
  memberId:memberA,userId:memberA
 });
 assert.equal(foreign.status,404);
 assert.equal(e.messages.length,previousCount);
 const reply=await e.apiPost({
  message:"What goal did I tell you about earlier?",memberId:memberA,userId:memberA
 });
 assert.equal(reply.status,200);
 assert.equal(reply.data.source,"saved-private-history");
 assert.ok(reply.data.response.includes("watercolor painting"),JSON.stringify({reply:reply.data,traces:e.traces.slice(-3)}));
 assert.ok(!reply.data.response.includes("time management"));
 assert.equal(e.messages.length,previousCount+2);
 assert.equal(e.messages.slice(-1)[0].member_id,memberB);
 assert.equal(e.providerCalls(),0);
});
test("unapproved or signed-out members cannot invoke any Life Coach endpoint",async()=>{
 const e=mockLifeEnvironment();
 await e.store.saveLifeTurn(memberA,threadA,factA,"Saved A");
 e.signIn(null);
 for(const path of ["","?id="+threadA,"?recall=goal"]){
  const result=await e.apiGet(path);
  assert.equal(result.status,403);
  assert.equal(result.data.ok,false);
 }
 const post=await e.apiPost({message:"What is my goal?",conversationId:threadA});
 assert.equal(post.status,403);
 assert.equal(e.providerCalls(),0);
});
test("private Preview access requires a verified primary, allowlisted Clerk email and stays off in production",async()=>{
 let currentUser=null;
 const processStub={env:{VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",LIFE_COACH_TESTER_EMAILS:"a@example.test,b@example.test"}};
 const module=moduleFrom("lib/lifeCoachAccess.ts",{
  "@clerk/nextjs/server":{currentUser:async()=>currentUser}
 },{process:processStub});
 const account=(id,email,verified=true)=>({
  id,primaryEmailAddressId:"primary",
  emailAddresses:[{id:"primary",emailAddress:email,verification:{status:verified?"verified":"unverified"}},
   {id:"alternate",emailAddress:"a@example.test",verification:{status:"verified"}}]
 });
 assert.equal(await module.lifeTester(),null);
 currentUser=account(memberA,"a@example.test");
 assert.equal(await module.lifeTester(),memberA);
 currentUser=account(memberB,"b@example.test");
 assert.equal(await module.lifeTester(),memberB);
 currentUser=account("not-allowed","other@example.test");
 assert.equal(await module.lifeTester(),null);
 currentUser=account(memberA,"a@example.test",false);
 assert.equal(await module.lifeTester(),null);
 currentUser=account(memberA,"other@example.test");
 assert.equal(await module.lifeTester(),null);
 currentUser=account(memberA,"a@example.test");
 processStub.env.VERCEL_GIT_COMMIT_REF="main";
 assert.equal(await module.lifeTester(),null);
 processStub.env.VERCEL_GIT_COMMIT_REF="feature/life-coach-agent-sandbox-20261011";
 processStub.env.VERCEL_ENV="production";
 assert.equal(await module.lifeTester(),null);
});

test("unenrolled private Life users cannot invoke paid Pickaxe or read other member details",async()=>{
 const e=mockLifeEnvironment();
 await e.store.saveLifeTurn(memberA,threadA,factA,"A's progress notes");
 await e.store.saveLifeTurn(memberB,threadB,factB,"B's progress notes");
 e.enableMockProvider();
 e.signIn(memberB);
 const result=await e.apiPost({message:"Build a detailed weekly plan based on the goal I shared earlier.",memberId:memberA,userId:memberA});
 assert.equal(result.status,503);
 assert.equal(e.providerCalls(),0);
});

test("wrong Neon preview branch rejects Life reads and writes before any personal data query",async()=>{
 const e=mockLifeEnvironment();
 e.signIn(memberA);
 e.setDatabaseBranch("br-wrong-branch");
 const get=await e.apiGet("");
 assert.equal(get.status,503);
 const post=await e.apiPost({message:"My goal is to read daily. Please remember this goal."});
 assert.equal(post.status,503);
 assert.equal(e.providerCalls(),0);
 assert.ok(e.traces.length===2);
 assert.ok(e.traces.every(t=>t.query.includes("current_setting('neon.branch_id'")));
 assert.equal(e.messages.length,0);
});
