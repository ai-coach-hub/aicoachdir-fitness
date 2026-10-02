import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';

const NOW = '2026-10-02T15:00:00Z';
const MEMBER = 'member@example.invalid';
const source = await readFile(new URL('../app/api/fitness/chat/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source + '\nmodule.exports.__test = {readCoachCompletionContext, addCompletionContext, isCompletionHistoryQuestion, requestCoachQualityRewrite};', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(fetchImpl, email = MEMBER, access = true) {
  const module = { exports: {} };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console: {info(){},warn(){},error(){}},
    Request, Response, Headers, URL, AbortSignal, AbortController, Buffer,
    Date: FixedDate, Intl, crypto, setTimeout, clearTimeout, fetch: fetchImpl,
    process: {env: {PICKAXE_WORKSPACE_API_TOKEN:'test-workspace', PICKAXE_FITNESS_COACH_DEPLOYMENT_ID:'test-deployment'}},
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name === 'node:util') return {isDeepStrictEqual};
      if (name === '@clerk/nextjs/server') return {currentUser: async () => email ? {id:'test', primaryEmailAddressId:'primary',emailAddresses:[{id:'primary',emailAddress:email}]} : null};
      if (name === '@/lib/memberIdentity') return {canonicalMemberEmail: e => e.trim().toLowerCase()};
      if (name === '@/lib/fitnessMembershipDb') return {memberHasFitnessAccess: async () => access};
      throw new Error('Unexpected import ' + name);
    },
  }, {timeout:5000});
  return module.exports;
}
const completed = {workoutId:'spin', title:'Easy Spin', completedAt:'2026-10-02T13:00:00Z', scheduledDate:'2026-10-02', durationMinutes:20, notes:'private note must not leave storage', exercises:[{name:'private exercise detail'}]};
const defs = [{id:'history',name:'fitness-workout-history-v1'}];
const responseFor = entries => Response.json({data:{items:[{value:JSON.stringify({updatedAt:NOW,entries})}]}});
function backend(entries, calls=[], overrides={}) {
  return async (url, init={}) => {
    calls.push({url:String(url),init});
    if (String(url).includes('/studio/memory/list')) return Response.json({data:{items:defs}});
    if (String(url).includes('/studio/memory/user/')) return responseFor(entries);
    if (String(url).endsWith('/completions')) return Response.json({result:'I can see your recorded Easy Spin session.'});
    if (overrides.other) return overrides.other(url,init);
    throw new Error('Unexpected request: '+url);
  };
}
const post = message => new Request('https://example.invalid/api/fitness/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,conversationId:'fitness-chat-contexttest',email:'attacker@example.invalid'})});

test('reads only the authenticated member history using uncached GETs',async()=>{
  const calls=[];
  const result=await load(backend([completed],calls)).__test.readCoachCompletionContext(MEMBER,'test-workspace');
  assert.equal(result.state,'ok');
  assert.equal(result.entries[0].title,'Easy Spin');
  assert.equal(result.entries[0].recordedDurationMinutes,20);
  assert.ok(calls.every(c=>(c.init.method||'GET')==='GET' && c.init.cache==='no-store'));
  assert.ok(calls[1].url.includes(encodeURIComponent(MEMBER)));
  assert.equal(calls[1].init.headers.Authorization,'Bearer test-workspace');
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.ok(!JSON.stringify(result).includes(MEMBER));
});

test('ordinary history POST gives fresh records to Coach without plan Actions or writes',async()=>{
  const calls=[];
  const response=await load(backend([completed],calls)).POST(post('What was my last completed workout?'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.match(body.response,/Easy Spin/);
  const completions=calls.filter(c=>c.url.endsWith('/completions'));
  assert.equal(completions.length,1);
  const payload=JSON.parse(completions[0].init.body);
  assert.equal(payload.userId,MEMBER);
  assert.ok(payload.message.includes('Easy Spin'));
  assert.ok(payload.message.includes('2026-10-02'));
  assert.ok(payload.message.includes('at most 15'));
  assert.ok(!payload.message.includes('attacker@example.invalid'));
  assert.ok(!payload.message.includes('private note'));
  assert.ok(!calls.some(c=>c.url.includes('/action/') || c.init.method==='PATCH'));
  assert.ok(!JSON.stringify(body).includes('FRESH SAVED WORKOUT COMPLETIONS'));
});

test('new completion is read on the next turn in the same conversation',async()=>{
  let entries=[]; const calls=[];
  const fetchImpl=async(url,init={})=>backend(entries,calls)(url,init);
  const app=load(fetchImpl);
  await app.POST(post('What did I complete today?'));
  entries=[completed];
  await app.POST(post('What did I complete today?'));
  const payloads=calls.filter(c=>c.url.endsWith('/completions')).map(c=>JSON.parse(c.init.body));
  assert.ok(!payloads[0].message.includes('Easy Spin'));
  assert.ok(payloads[1].message.includes('Easy Spin'));
});

test('planned, deleted, invalid and future completions are not presented as completed',async()=>{
  const entries=[{...completed,completedAt:null},{...completed,deleted:true},{...completed,completedAt:'bad'},{...completed,status:'planned'},{...completed,completedAt:'2026-10-03T00:00:00Z'},completed];
  const result=await load(backend(entries)).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(result.entries.length,1);
});

test('latest snapshot wins over old history and removed records stay removed',async()=>{
  const fetchImpl=async url=>String(url).includes('/memory/list') ? Response.json({data:defs}) : Response.json({data:[{value:JSON.stringify({updatedAt:'2026-10-01T00:00:00Z',entries:[completed]})},{value:JSON.stringify({updatedAt:NOW,entries:[]})}]});
  const result=await load(fetchImpl).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(result.state,'ok');
  assert.equal(result.entries.length,0);
});

test('multiple recognized histories are combined and duplicate sessions counted once',async()=>{
  const fetchImpl=async url=>String(url).includes('/memory/list') ? Response.json({data:[...defs,{id:'history2',name:'fitness workout history (for ai coach)'}]}) : responseFor([completed]);
  const result=await load(fetchImpl).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(result.state,'ok');
  assert.equal(result.entries.length,1);
});

test('failed history read is not a successful empty history and costs no model call',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{calls.push(String(url));return String(url).includes('/memory/list') ? Response.json({data:defs}) : new Response('error',{status:503});};
  const app=load(fetchImpl);
  assert.equal((await app.__test.readCoachCompletionContext(MEMBER,'token')).state,'unavailable');
  const body=await (await app.POST(post('What was my last workout?'))).json();
  assert.equal(body.relaySource,'workout-history-unavailable');
  assert.match(body.response,/does not mean it was lost/);
  assert.ok(!calls.some(url=>url.endsWith('/completions')));
});

test('missing history configuration, empty history, malformed history and read errors are distinct',async()=>{
  const missing=await load(async()=>Response.json({data:[]})).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(missing.state,'not_configured');
  const empty=await load(backend([])).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(empty.state,'ok');
  const bad=await load(async url=>String(url).includes('/memory/list') ? Response.json({data:defs}):Response.json({data:[{value:'not json'}]})).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(bad.state,'unavailable');
  const error=await load(async()=>{throw new Error('aborted')}).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(error.state,'unavailable');
});

test('partial reads are explicitly partial even when some completions are found',async()=>{
  const fetchImpl=async url=>String(url).includes('/memory/list') ? Response.json({data:[...defs,{id:'second',name:'fitness workout history for ai coach'}]}) : String(url).includes('memoryId=second') ? new Response('',{status:500}):responseFor([completed]);
  const result=await load(fetchImpl).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(result.state,'partial');
  assert.equal(result.entries.length,1);
});

test('no shared cache mixes records between members',async()=>{
  const fetchImpl=async url=>String(url).includes('/memory/list') ? Response.json({data:defs}) : responseFor([{...completed,title:String(url).includes('second%40')?'Second member workout':'First member workout'}]);
  const fn=load(fetchImpl).__test.readCoachCompletionContext;
  const [a,b]=await Promise.all([fn('first@example.invalid','token'),fn('second@example.invalid','token')]);
  assert.equal(a.entries[0].title,'First member workout');
  assert.equal(b.entries[0].title,'Second member workout');
});

test('context is bounded and excludes identifiers, notes, prescriptions and performance guesses',async()=>{
  const entries=Array.from({length:30},(_,i)=>({...completed,workoutId:'w'+i,title:'Long title '.repeat(30)}));
  const result=await load(backend(entries)).__test.readCoachCompletionContext(MEMBER,'token');
  assert.equal(result.entries.length,15);
  assert.ok(result.entries.every(e=>e.title.length<=120));
  assert.ok(!JSON.stringify(result).includes('notes'));
  assert.ok(!JSON.stringify(result).includes('workoutId'));
});

test('private context strips cleanly from Previous Chats without losing the member message',async()=>{
  const context=await load(backend([completed])).__test.readCoachCompletionContext(MEMBER,'token');
  const f=load(backend([])).__test;
  const history=await readFile(new URL('../app/api/fitness/chat/history/route.ts',import.meta.url),'utf8');
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(history+'\nmodule.exports.clean=memberFacingHistoryText;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:()=>({})});
  for(const input of ['What did I complete?','APPLICATION COACHING QUALITY RULES - apply silently.\nMEMBER MESSAGE:\nWhat did I complete?']) {
    assert.equal(module.exports.clean('user',f.addCompletionContext(input,context)),'What did I complete?');
  }
});

test('authentication and membership checks run before any history request',async()=>{
  for(const [email,access,status] of [[null,true,401],[MEMBER,false,403]]) {
    let calls=0;
    const res=await load(async()=>{calls++;throw new Error('must not fetch');},email,access).POST(post('What was my last workout?'));
    assert.equal(res.status,status);assert.equal(calls,0);
  }
});

test('quality rewrites retain fresh completion context',async()=>{
  const calls=[];
  const f=load(backend([completed],calls)).__test;
  const context=await f.readCoachCompletionContext(MEMBER,'token');
  await f.requestCoachQualityRewrite({deploymentKey:'test',memberEmail:MEMBER,memberMessage:'What should I do?',draftResponse:'A draft',completionContext:context});
  assert.ok(JSON.parse(calls.find(c=>c.url.endsWith('/completions')).init.body).message.includes('Easy Spin'));
});
