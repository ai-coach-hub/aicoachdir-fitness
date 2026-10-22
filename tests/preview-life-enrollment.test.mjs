import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
function loadModule(path,deps,env){
 const compiled=ts.transpileModule(read(path),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const mod={exports:{}};
 runInNewContext(compiled,{module:mod,exports:mod.exports,Response,
  process:{env},require:(name)=>{
   if(!Object.hasOwn(deps,name))throw Error("Unexpected dependency: "+name);
   return deps[name];
  }},{timeout:3000});
 return mod.exports;
}
const env=()=>({
 VERCEL_ENV:"preview",
 VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",
 PREVIEW_SHARED_USAGE_METER_ENABLED:"true",
 LIFE_COACH_DATABASE_URL:"postgresql://private.invalid/test"
});
function setup(overrides={}){
 const current={...env(),...overrides};
 const records=new Map();
 let dbBranch="br-autumn-breeze-auw38rgr",member="member-alpha";
 let writes=0;
 const query=async(strings,...values)=>{
  const statement=strings.join(" ? ");
  if(statement.includes("current_setting('neon.branch_id'"))
   return [{branch_id:dbBranch}];
  if(statement.includes("INSERT INTO preview_ai_usage_periods")){
   const [id,subscription,period,limit]=values;
   assert.equal(subscription,"preview-shared-three-use-20261020");
   assert.equal(limit,3);
   const key=id+":"+subscription+":"+period;
   if(!records.has(key)){records.set(key,{limit_uses:limit,reserved_uses:0,completed_uses:0});writes++;}
   return [];
  }
  if(statement.includes("SELECT limit_uses,reserved_uses,completed_uses")){
   const [id,subscription,period]=values;
   const row=records.get(id+":"+subscription+":"+period);
   return row?[row]:[];
  }
  throw Error("Unexpected SQL: "+statement);
 };
 const enrollment=loadModule("lib/previewLifeTestEnrollment.ts",{
  "@neondatabase/serverless":{neon:(url)=>{assert.equal(url,current.LIFE_COACH_DATABASE_URL);return query;}}
 },current);
 const route=loadModule("app/api/life/usage-test/route.ts",{
  "@/lib/lifeCoachAccess":{lifeTester:async()=>member},
  "@clerk/nextjs/server":{currentUser:async()=>({
   id:member,primaryEmailAddressId:"primary",
   emailAddresses:[{id:"primary",emailAddress:"tester@example.test",
    verification:{status:"verified"}}]
  })},
  "@/lib/previewSharedMemberBinding":{bindPrivatePreviewMember:async()=> "member_test"},
  "@/lib/previewLifeTestEnrollment":enrollment
 },current);
 return {route,enrollment,writes:()=>writes,records,setMember:id=>member=id,setBranch:id=>dbBranch=id};
}
test("three-use preview opt-in is locked to the private preview branch",async()=>{
 for(const override of [
  {VERCEL_ENV:"production"},
  {VERCEL_GIT_COMMIT_REF:"main"},
  {PREVIEW_SHARED_USAGE_METER_ENABLED:undefined}
 ]){
  const x=setup(override);
  assert.equal((await x.route.GET()).status,404);
  assert.equal((await x.route.POST()).status,404);
  assert.equal(x.writes(),0);
 }
});

test("no signed-in allowlisted Clerk member means no enrollment or status access",async()=>{
 const x=setup();
 x.setMember(null);
 assert.equal((await x.route.GET()).status,403);
 assert.equal((await x.route.POST()).status,403);
 assert.equal(x.writes(),0);
});

test("Neon preview branch mismatch blocks enrollment before any mutation",async()=>{
 const x=setup();
 x.setBranch("br-sparkling-glitter-aucpz59d");
 const response=await x.route.POST();
 assert.equal(response.status,503);
 assert.equal(x.writes(),0);
});

test("opt-in is idempotent, limited to three uses and isolated per authenticated member",async()=>{
 const x=setup();
 let response=await x.route.GET();
 assert.equal(response.status,200);
 assert.equal((await response.json()).active,false);
 response=await x.route.POST();
 assert.equal(response.status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(await response.json())),
  {ok:true,active:true,remaining:3,used:0,pending:0,limit:3});
 assert.equal(x.writes(),1);
 await x.route.POST();
 assert.equal(x.writes(),1,"repeated enrollment must not reset allowance");
 x.setMember("member-beta");
 response=await x.route.GET();
 assert.equal((await response.json()).active,false);
 response=await x.route.POST();
 assert.equal((await response.json()).remaining,3);
 assert.equal(x.writes(),2);
 x.setMember("member-alpha");
 assert.equal((await (await x.route.GET()).json()).remaining,3);
});

test("preview account's consumed and reserved uses reduce its displayed allowance",async()=>{
 const x=setup();
 await x.route.POST();
 const row=[...x.records.values()][0];
 row.completed_uses=1;row.reserved_uses=1;
 const response=await x.route.GET();
 assert.deepEqual(JSON.parse(JSON.stringify(await response.json())),
  {ok:true,active:true,remaining:1,used:1,pending:1,limit:3});
});
