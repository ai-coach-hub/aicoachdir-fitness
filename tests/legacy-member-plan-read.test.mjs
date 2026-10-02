import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { legacyPlanFromPayload, readLegacyMemberPlan } from '../lib/legacyWorkoutRead.ts';

const MEMBER = 'member@example.invalid';
const makePlan = (extra = {}) => ({
  schemaVersion: 2, planId: 'legacy-flex', updatedAt: '2026-10-02T19:00:00Z',
  scheduleMode: 'flexible_sequence',
  flexibleSequence: [{ id: 'choice-1', label: 'Cycling', workoutId: 'cycle' }],
  workouts: { cycle: { id: 'cycle', title: 'Cycling', durationMinutes: 30, exercises: [{ name: 'Cycling' }] } },
  ...extra,
});
const envelope = value => ({data:{items:[{memoryId:'display-memory',value}]}});

test('recovers a flexible plan in an alternate member display memory', () => {
  const plan = makePlan();
  assert.deepEqual(legacyPlanFromPayload(envelope(JSON.stringify({plan})), MEMBER), plan);
});
test('supports the existing portal decoder for fenced serialized plans', () => {
  const plan = makePlan();
  assert.deepEqual(legacyPlanFromPayload(envelope('Saved workout plan:\n```json\n'+JSON.stringify(plan)+'\n```'),MEMBER),plan);
});
test('keeps current root and staged next plan together', () => {
  const plan = makePlan({ nextPlan: { effectiveFrom: '2026-10-04', plan: makePlan({planId:'future',updatedAt:'2026-10-03T12:00:00Z'}) } });
  assert.deepEqual(legacyPlanFromPayload(envelope(JSON.stringify(plan)), MEMBER),plan);
});
test('does not convert a flexible schedule into invented weekdays', () => {
  const result = legacyPlanFromPayload(envelope(JSON.stringify(makePlan())),MEMBER);
  assert.equal(result.scheduleMode,'flexible_sequence');
  assert.equal('weekSchedule' in result,false);
});
test('rejects deleted memory wrappers and deleted/draft plans', () => {
  assert.equal(legacyPlanFromPayload({data:[{deleted:true,value:JSON.stringify(makePlan())}]}, MEMBER),null);
  assert.equal(legacyPlanFromPayload(envelope(JSON.stringify(makePlan({status:'draft'}))), MEMBER),null);
});
test('rejects a conflicting member identity, including staged children', () => {
  assert.equal(legacyPlanFromPayload(envelope(makePlan({_historyBridge:{email:'other@example.invalid'}})),MEMBER),null);
  assert.equal(legacyPlanFromPayload(envelope(makePlan({nextPlan:{plan:makePlan({_historyBridge:{email:'other@example.invalid'}})}})),MEMBER),null);
});
test('does not recover a workout suggested inside chat text or notes', () => {
  assert.equal(legacyPlanFromPayload({notes:JSON.stringify(makePlan()),response:JSON.stringify(makePlan())}, MEMBER),null);
});
test('newest usable root wins without mutating its source', () => {
  const newer=makePlan(), older=makePlan({updatedAt:'2026-09-01T00:00:00Z'});
  const payload={data:[{value:older},{value:newer}]};
  const before=JSON.stringify(payload);
  assert.deepEqual(legacyPlanFromPayload(payload,MEMBER),newer);
  assert.equal(JSON.stringify(payload),before);
});
test('member read is one uncached GET using only the supplied verified member',async()=>{
  const calls=[];
  const result=await readLegacyMemberPlan(' MEMBER@EXAMPLE.INVALID ','token',{
    fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json(envelope(JSON.stringify(makePlan())));},
    cacheReader:async()=>{throw new Error('cache must not supersede fresh plan');},
  });
  assert.equal(result.source,'member-memory');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/user\/member%40example.invalid\?/);
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.cache,'no-store');
});
test('falls back to the same member server cache without writing records',async()=>{
  let cachedEmail='';
  const result=await readLegacyMemberPlan(MEMBER,'token',{
    fetchImpl:async()=>Response.json(envelope(null)),
    cacheReader:async email=>{cachedEmail=email;return makePlan();},
  });
  assert.equal(cachedEmail,MEMBER);assert.equal(result.source,'server-cache');assert.equal(result.plan.planId,'legacy-flex');
});
test('does not invent a plan when both reads fail',async()=>{
  const result=await readLegacyMemberPlan(MEMBER,'token',{
    fetchImpl:async()=>{throw new Error('offline');},cacheReader:async()=>{throw new Error('offline');},
  });
  assert.deepEqual(result,{plan:null,source:null});
});
test('invalid identity or missing credential causes zero external reads',async()=>{
  const options={fetchImpl:async()=>{throw new Error('unexpected');},cacheReader:async()=>{throw new Error('unexpected');}};
  assert.equal((await readLegacyMemberPlan('', 'token',options)).plan,null);
  assert.equal((await readLegacyMemberPlan(MEMBER,'',options)).plan,null);
});

const source=await readFile(new URL('../app/api/fitness/chat/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route({signedIn=true,access=true,existing=null}={}){
  const module={exports:{}}, calls=[], stats={fallback:0};
  const fetchImpl=async(url,init={})=>{
    calls.push({url:String(url),method:init.method||'GET'});
    if(String(url).includes('/memory/list'))return Response.json({data:[{id:'plan',name:'fitness-workout-plan-v1'}]});
    if(String(url).includes('memoryId=plan'))return Response.json(envelope(existing));
    throw new Error('Unexpected external request');
  };
  vm.runInNewContext(compiled,{
    module,exports:module.exports,console, Request,Response,Headers,URL,AbortSignal,AbortController,
    Buffer,Date,Intl,crypto,setTimeout,clearTimeout,fetch:fetchImpl,
    process:{env:{PICKAXE_WORKSPACE_API_TOKEN:'test'}},
    require(name){
      if(name==='node:crypto')return crypto;
      if(name==='node:util')return{isDeepStrictEqual};
      if(name==='@clerk/nextjs/server')return{currentUser:async()=>signedIn?{id:'member',emailAddresses:[{id:'p',emailAddress:MEMBER}],primaryEmailAddressId:'p'}:null};
      if(name==='@/lib/memberIdentity')return{canonicalMemberEmail:email=>email};
      if(name==='@/lib/fitnessMembershipDb')return{memberHasFitnessAccess:async()=>access};
      if(name==='@/lib/legacyWorkoutRead')return{readLegacyMemberPlan:async email=>{assert.equal(email,MEMBER);stats.fallback++;return{plan:makePlan(),source:'member-memory'};}};
      throw new Error('unexpected import '+name);
    },
  });
  return{get:module.exports.GET,calls,stats};
}
test('GET returns existing legacy plan before any recovery writes or model generation',async()=>{
  const r=route();const res=await r.get();const body=await res.json();
  assert.equal(res.status,200);assert.equal(body.plan.planId,'legacy-flex');
  assert.equal(r.stats.fallback,1);assert.ok(r.calls.every(c=>c.method==='GET'));
  assert.ok(r.calls.every(c=>!c.url.includes('/action/')&&!c.url.includes('/completions')));
});
test('an existing formal plan and nextPlan never invoke or get replaced by fallback',async()=>{
  const plan=makePlan({nextPlan:{effectiveFrom:'2099-10-04',plan:makePlan({planId:'future'})}});
  const r=route({existing:JSON.stringify(plan)});const body=await(await r.get()).json();
  assert.equal(r.stats.fallback,0);assert.deepEqual(body.plan,plan);
});
test('membership authentication and authorization still precede legacy reads',async()=>{
  for(const [args,status] of [[{signedIn:false},401],[{access:false},403]]){
    const r=route(args);assert.equal((await r.get()).status,status);assert.equal(r.stats.fallback,0);assert.equal(r.calls.length,0);
  }
});
