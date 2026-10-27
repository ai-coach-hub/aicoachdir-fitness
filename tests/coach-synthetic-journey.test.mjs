import test from "node:test";
import assert from "node:assert/strict";
import {runNewCoachTurn} from "../lib/newCoachTurnCore.mjs";
import {newCoachHistoryPort} from "../lib/newCoachHistoryPort.mjs";
import {visibleMemberCoaches} from "../lib/coachLaunchCatalog.mjs";
import {coachLaunchReadiness} from "../lib/coachLaunchReadiness.mjs";

/** Isolated, no external services, cards, tokens, member data or AI charges. */
const member="user_synthetic12345";
const other="user_anothersynth123";
const thread="career-syntheticthread12345";
const make=()=>{
 const records=new Map(),credits=new Map(),status=new Map();
 const repository={
  read:async key=>(records.get([key.coach,key.memberId,key.threadId].join("|"))||[]).slice(),
  save:async row=>{
   const k=[row.coach,row.memberId,row.threadId].join("|"),old=records.get(k)||[];
   const prior=old.find(t=>t.requestKey===row.requestKey);
   if(prior)return prior.question===row.question&&prior.reply===row.reply?"already_saved":"conflict";
   records.set(k,[...old,{requestKey:row.requestKey,question:row.question,reply:row.reply}]);return "saved";
  }
 };
 const ports=(id,requestKey,limit=2)=>{
  const wallet=credits.get(id)||{limit,completed:0,reserved:new Set()};
  credits.set(id,wallet);
  return {
   authorize:async()=>({ok:true,memberId:id}),
   reserve:async()=>{
    if(status.get(id+requestKey)==="completed")return "already_completed";
    if(wallet.completed+wallet.reserved.size>=wallet.limit)return "exhausted";
    wallet.reserved.add(requestKey);return "reserved";
   },
   settle:async kind=>{
    if(!wallet.reserved.has(requestKey))return "missing";
    if(kind==="completed"){wallet.completed++;wallet.reserved.delete(requestKey);status.set(id+requestKey,"completed");return "completed";}
    if(kind==="released"){wallet.reserved.delete(requestKey);return "released";}
    return "uncertain";
   }
  };
 };
 return {repository,records,credits,ports};
};
test("synthetic member: coach scope, history saved before one shared quota debit",async()=>{
 const env=make(),identity=member,requestKey="req_synth_12345678901";
 const history=newCoachHistoryPort({coach:"career",memberId:identity,repo:env.repository});
 assert.ok(history);
 const wallet=env.ports(identity,requestKey);
 const generated=await runNewCoachTurn({...wallet,
  generate:async()=>({kind:"generated",reply:"Synthetic career plan",calls:[
   {attempts:1,costUsd:.004,inputTokens:200,outputTokens:50},
   {attempts:1,costUsd:.006,inputTokens:90,outputTokens:70}]}),
  saveTurn:async(_identity,reply)=>history.save(thread,requestKey,"Synthetic goal",reply)});
 assert.equal(generated.status,"completed");
 assert.equal(generated.metrics.providerCalls,2);
 assert.equal(generated.metrics.costUsd,.01);
 assert.equal(env.credits.get(member).completed,1);
 assert.equal((await history.read(thread)).length,1);
 assert.equal((await newCoachHistoryPort({coach:"career",memberId:other,repo:env.repository}).read(thread)).length,0);
 assert.equal(await history.read("life-syntheticthread12345"),null);
 const replay=await runNewCoachTurn({...wallet,generate:async()=>{throw Error("must not re-run")} ,
  saveTurn:async()=>{throw Error("must not re-save")}});
 assert.equal(replay.status,"blocked");
 assert.equal(replay.reason,"already_completed");
 assert.equal(env.credits.get(member).completed,1);
});
test("synthetic member: cap, bad auth, failure preserve reservation",async()=>{
 const env=make();
 const key1="req_synth_11111111111";
 const p=env.ports(member,key1,1);
 const bad=await runNewCoachTurn({...p,authorize:async()=>({ok:false}),
  generate:async()=>{throw Error("unexpected")},saveTurn:async()=>{throw Error("unexpected")}});
 assert.equal(bad.status,"blocked");
 const failed=await runNewCoachTurn({...p,generate:async()=>{throw Error("timeout")},saveTurn:async()=>{throw Error("unexpected")}});
 assert.equal(failed.status,"uncertain");
 assert.equal(env.credits.get(member).reserved.size,1);
 const blocked=await runNewCoachTurn({...env.ports(member,"req_synth_22222222222",1),
  generate:async()=>{throw Error("unexpected")},saveTurn:async()=>{throw Error("unexpected")}});
 assert.equal(blocked.status,"blocked");assert.equal(blocked.reason,"exhausted");
});
test("synthetic release: Career never appears without provider/usage, even if claimed ready",()=>{
 assert.deepEqual(visibleMemberCoaches({lifeAvailable:true}).map(c=>c.slug),["fitness","budgeting","life"]);
 assert.equal(coachLaunchReadiness({routeReady:true,providerConfigured:true}).ready,false);
});
