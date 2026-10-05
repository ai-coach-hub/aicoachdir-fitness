import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import ts from 'typescript';

const MEMBER='member@example.invalid',NOW='2026-10-02T22:00:00Z';
const ID='10000000-0000-4000-8000-000000000001',ID2='10000000-0000-4000-8000-000000000002';
const copy=x=>JSON.parse(JSON.stringify(x));
class FixedDate extends Date { constructor(...args){super(...(args.length?args:[NOW]));} static now(){return Date.parse(NOW);} }
const plan={schemaVersion:2,planId:'flexible-test',updatedAt:NOW,scheduleMode:'flexible_sequence',userTimezone:'America/Chicago',flexibleSequence:[{id:'choice',label:'Cycling',workoutId:'cycle',isRestDay:false}],workouts:{cycle:{id:'cycle',title:'Cycling',durationMinutes:30,exercises:[{id:'cycle-1',name:'Cycling',trackingType:'time',durationMinutes:30}]}}};
const tracked=[{id:'cycle-1',name:'Cycling',trackingType:'time',skipped:false,sets:[{weight:'',reps:'',time:'30 min',distance:'5 miles'}]}];
const old={workoutId:'previous',title:'Earlier session',scheduledDate:'2026-10-01',completedAt:'2026-10-01T15:00:00Z',notes:'Preserve me',exercises:[]};
const env=value=>({data:{items:[{value:JSON.stringify(value)}]}});
const source=await readFile(new URL('../app/api/fitness/chat/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source+'\nmodule.exports.helpers={newestCompletionSnapshot,validCompletionDate,flexiblePlanForCompletion};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function route({legacy=false,signedIn=true,access=true,historyFail=false,writeReadFail=false,unverified=false,historyMalformed=false,savedPlan=plan}={}){
 const module={exports:{}},calls=[],writes=[],fallback=[];
 let history={updatedAt:'2026-10-02T12:00:00Z',entries:[copy(old)]},readCount=0;
 const fetchImpl=async(url,init={})=>{
  const address=String(url),method=init.method||'GET';calls.push({address,method});
  if(address.includes('/memory/list'))return Response.json({data:[{id:'plan',name:'fitness-workout-plan-v1'},{id:'hist',name:'fitness-workout-history-v1'}]});
  if(address.includes('memoryId=plan'))return Response.json(env(legacy?null:savedPlan));
  if(address.includes('memoryId=hist')){
   readCount++;
   if(historyFail||(writeReadFail&&readCount>1))return new Response('',{status:503});
   if(historyMalformed)return Response.json({message:'unexpected success'});
   return Response.json(env(history));
  }
  if(method==='PATCH'&&address.endsWith('/hist')){
   writes.push(JSON.parse(init.body));
   if(!unverified)history=JSON.parse(writes.at(-1).data.value);
   return Response.json({ok:true});
  }
  throw new Error('Unexpected endpoint '+address);
 };
 vm.runInNewContext(compiled,{
  module,exports:module.exports,console:{info(){},warn(){},error(){}},Request,Response,Headers,URL,AbortSignal,AbortController,Buffer,Date:FixedDate,Intl,crypto,setTimeout,clearTimeout,fetch:fetchImpl,
  process:{env:{PICKAXE_WORKSPACE_API_TOKEN:'test-workspace'}},
  require(name){
   if(name==='node:crypto')return crypto;
   if(name==='node:util')return {isDeepStrictEqual:(a,b)=>isDeepStrictEqual(copy(a),copy(b))};
   if(name==='@clerk/nextjs/server')return {currentUser:async()=>signedIn?{id:'test-user',primaryEmailAddressId:'p',emailAddresses:[{id:'p',emailAddress:MEMBER}]}:null};
   if(name==='@/lib/memberIdentity')return {canonicalMemberEmail:e=>e.trim().toLowerCase()};
   if(name==='@/lib/fitnessMembershipDb')return {memberHasFitnessAccess:async()=>access};
   if(name==='@/lib/legacyWorkoutRead')return {readLegacyMemberPlan:async(email)=>{fallback.push(email);return {plan:copy(savedPlan),source:'server-cache'};}};
   throw new Error('Unexpected import '+name);
  },
 });
 const post=async(extra={})=>module.exports.POST(new Request('https://example.invalid/api/fitness/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete_workout',completionMode:'flexible',completionId:ID,workoutId:'cycle',scheduledDate:'2026-10-02',exercises:tracked,notes:'Felt easy',actualDurationMinutes:30,...extra})}));
 return{post,calls,writes,fallback,history:()=>history,helpers:module.exports.helpers};
}

test('flexible workout saves actual tracking and can be read back without assigning schedule dates',async()=>{
 const r=route(),before=JSON.stringify(plan),res=await r.post();assert.equal(res.status,200);
 const entry=r.history().entries[0];assert.equal(entry.completionId,ID);assert.equal(entry.actualDurationMinutes,30);
 assert.deepEqual(entry.exercises,tracked);assert.equal(entry.notes,'Felt easy');assert.deepEqual(r.history().entries[1],old);
 assert.equal(JSON.stringify(plan),before);assert.ok(r.calls.every(c=>c.method==='GET'||c.address.endsWith('/hist')));
 assert.ok(!r.calls.some(c=>c.address.includes('/completions')));
});
test('legacy visible plan is resolved for completion, not only for display',async()=>{
 const r=route({legacy:true});assert.equal((await r.post({email:'someone-else@example.invalid'})).status,200);
 assert.deepEqual(r.fallback,[MEMBER]);assert.ok(r.calls.filter(c=>c.address.includes('/memory/user/')).every(c=>c.address.includes(encodeURIComponent(MEMBER))));
});
test('retrying the same session ID does not create a duplicate or another write',async()=>{
 const r=route();await r.post();const res=await r.post();assert.equal(res.status,200);assert.equal((await res.json()).alreadySynced,true);assert.equal(r.writes.length,1);
});
test('a second flexible session on the same date gets its own record',async()=>{
 const r=route();await r.post();await r.post({completionId:ID2});assert.equal(r.history().entries.length,3);
 assert.deepEqual(r.history().entries.slice(0,2).map(e=>e.completionId),[ID2,ID]);
});
test('a reused session ID cannot silently save different details',async()=>{
 const r=route();await r.post();assert.equal((await r.post({scheduledDate:'2026-10-01'})).status,409);assert.equal(r.writes.length,1);
});
for(const [name,extra] of [['future date',{scheduledDate:'2026-10-03'}],['invalid date',{scheduledDate:'2026-02-30'}],['missing session ID',{completionId:''}],['invalid minutes',{actualDurationMinutes:-1}],['invalid tracking',{exercises:'bad'}]]){
 test('rejects '+name+' without changing records',async()=>{const r=route();assert.equal((await r.post(extra)).status,400);assert.equal(r.writes.length,0);});
}
test('unknown or other-week workout cannot be submitted as a flexible session',async()=>{const r=route();assert.equal((await r.post({workoutId:'foreign'})).status,404);assert.equal(r.writes.length,0);});
test('fixed plans do not accept the flexible completion bypass',async()=>{
 const fixed={...copy(plan),scheduleMode:'fixed_weekdays',weekSchedule:[{date:'2026-10-02',workoutId:'cycle'}]};
 const r=route({savedPlan:fixed});assert.equal((await r.post()).status,404);assert.equal(r.writes.length,0);
 const valid=route({savedPlan:fixed});assert.equal((await valid.post({completionMode:undefined,completionId:undefined})).status,200);
});
for(const options of [{historyFail:true},{writeReadFail:true},{historyMalformed:true}]){
 test('unreadable history is never replaced with a single new entry '+JSON.stringify(options),async()=>{const r=route(options);assert.equal((await r.post()).status,502);assert.equal(r.writes.length,0);});
}
test('a write without matching readback is not reported as saved',async()=>{const r=route({unverified:true});assert.equal((await r.post()).status,502);});
for(const [options,status] of [[{signedIn:false},401],[{access:false},403]]){
 test('authentication and membership checks precede completion reads '+status,async()=>{const r=route(options);assert.equal((await r.post()).status,status);assert.equal(r.calls.length,0);});
}
test('double-escaped Pickaxe history envelope remains readable',()=>{
 const {helpers:h}=route();
 const escaped='{\\"schemaVersion\\":2,\\"updatedAt\\":\\"2026-10-05T20:00:00.000Z\\",\\"entries\\":[{\\"title\\":\\"Easy Spin\\"}]}';
 assert.deepEqual(h.newestCompletionSnapshot({data:{items:[{value:escaped}]}}),[{title:'Easy Spin'}]);
});
test('newest history envelope wins and malformed payload is not empty history',()=>{
 const {helpers:h}=route();const e={data:[{value:JSON.stringify({updatedAt:'2026-10-01',entries:[old]})},{value:JSON.stringify({updatedAt:'2026-10-02',entries:[]})}]};
 assert.equal(h.newestCompletionSnapshot(e).length,0);assert.equal(h.newestCompletionSnapshot({oops:true}),null);
});

const historySource=await readFile(new URL('../components/WorkoutHistoryList.tsx',import.meta.url),'utf8');
const historyModule={exports:{}};
const jsx=(type,props)=>({type,props});
vm.runInNewContext(ts.transpileModule(historySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
 module:historyModule,exports:historyModule.exports,Date,Intl,require:n=>n==='react/jsx-runtime'?{jsx,jsxs:jsx}:null,
});
function walk(node,visit){if(node==null||typeof node==='boolean')return;if(Array.isArray(node)){node.forEach(n=>walk(n,visit));return;}visit(node);if(typeof node==='object')walk(node.props?.children,visit);}
function nodes(tree,type){const found=[];walk(tree,n=>{if(n.type===type)found.push(n);});return found;}
function strings(tree){const found=[];walk(tree,n=>{if(typeof n==='string'||typeof n==='number')found.push(n);});return found.join(' ');}
test('all 15 available history entries have an expandable record, including recorded sets and notes',()=>{
 const entries=Array.from({length:15},(_,i)=>({...copy(old),title:'Session '+i,completedAt:`2026-10-01T${String(i).padStart(2,'0')}:00:00Z`,exercises:tracked}));
 const before=JSON.stringify(entries);const view=historyModule.exports.default({entries});
 assert.equal(nodes(view,'details').length,15);assert.match(strings(view),/Time: 30 min/);assert.match(strings(view),/Preserve me/);assert.equal(JSON.stringify(entries),before);
});
test('history distinguishes measured minutes from a saved prescription and date-only never shifts',()=>{
 const m=historyModule.exports,view=m.default({entries:[{...old,actualDurationMinutes:30,durationMinutes:60}]});
 assert.match(strings(view),/30 minutes completed/);assert.doesNotMatch(strings(view),/60 minutes completed/);
 assert.match(m.recordedWorkoutDate(old),/Oct 1, 2026/);
 assert.match(strings(m.default({entries:[old]})),/Duration not recorded/);
});
test('missing set measurements are stated honestly and planned entries do not appear',()=>{
 const view=historyModule.exports.default({entries:[old,{title:'Planned'}]});assert.equal(nodes(view,'details').length,1);assert.match(strings(view),/No exercise-by-exercise measurements/);
});

const pageSource=await readFile(new URL('../app/fitness/chat/page.tsx',import.meta.url),'utf8');
const pageCode=ts.transpileModule(pageSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function renderPage(savedPlan=plan,active=null){
 const states=[],setters=[],m={exports:{}};let index=0;
 const react={useState(initial){const i=index++;const v=i===0?'workouts':i===7?savedPlan:i===8?[old]:i===19?active:typeof initial==='function'?initial():initial;states[i]=v;return [v,next=>{setters.push([i,typeof next==='function'?next(states[i]):next]);}];},useMemo:fn=>fn(),useRef:value=>({current:value}),useEffect(){}};
 vm.runInNewContext(pageCode,{module:m,exports:m.exports,console,Date:FixedDate,Intl,crypto,Request,Response,fetch:async()=>{throw new Error('opening a workout must not save it');},require(n){
  if(n==='react')return react;if(n==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(n==='next/link')return{__esModule:true,default:'a'};if(n==='@clerk/nextjs')return{useClerk:()=>({signOut(){}})};
  if(n==='@/components/WorkoutHistoryList')return{__esModule:true,default:historyModule.exports.default};throw new Error(n);
 }});
 return{tree:m.exports.default(),setters};
}
test('undated flexible schedule and workout card both have working Start workout controls',()=>{
 const r=renderPage(),buttons=nodes(r.tree,'button').filter(n=>strings(n)==='Start workout');assert.equal(buttons.length,2);
 buttons[0].props.onClick();const active=r.setters.find(([i])=>i===19)[1];
 assert.equal(active.completionMode,'flexible');assert.equal(active.workoutId,'cycle');assert.equal(active.scheduledDate,'2026-10-02');assert.match(active.completionId,/^[a-f0-9-]{36}$/);
 assert.ok(nodes(r.tree,'a').some(n=>n.props.href==='#workout-history'));
});
test('flexible tracker exposes the date, actual duration, recorded inputs and save control',()=>{
 const r=renderPage(plan,{key:'current:cycle',completionMode:'flexible',completionId:ID,workoutId:'cycle',scheduledDate:'2026-10-02',scope:'current',day:'Workout',workout:plan.workouts.cycle});
 assert.ok(nodes(r.tree,'input').some(n=>n.props.type==='date'));
 assert.ok(nodes(r.tree,'input').some(n=>n.props.type==='number'));
 assert.ok(nodes(r.tree,'button').some(n=>strings(n)==='Complete workout and save'&&!n.props.disabled));
});
