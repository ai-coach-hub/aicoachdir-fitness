import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const rolling={VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true",
 SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true",
 SHARED_USAGE_OPENING_BALANCES_RECONCILED:"false",
 SHARED_USAGE_MIGRATION_MODE:"rolling_renewal",
 SHARED_USAGE_CUTOVER_AT:"2026-10-22T22:00:00.000Z",
 LIFE_COACH_LIVE_ENABLED:"true"};
test("Life Coach rolling release gate accepts verified Clerk logins without historical opening balance guesses",async()=>{
 const code=ts.transpileModule(read("lib/lifeCoachAccess.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let lookups=0;const m={exports:{}};
 runInNewContext(code,{module:m,exports:m.exports,process:{env:rolling},
 require:path=>{
  assert.equal(path,"@clerk/nextjs/server");
  return {currentUser:async()=>{lookups++;return null;}};
 },Date},{timeout:3000});
 assert.equal(await m.exports.lifeTester(),null);
 assert.equal(lookups,1,"release should advance to authenticated-member checks");
});
test("A partially configured Life Coach release still fails before trying to find members",async()=>{
 const code=ts.transpileModule(read("lib/lifeCoachAccess.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let lookups=0;const m={exports:{}};
 runInNewContext(code,{module:m,exports:m.exports,process:{env:{...rolling,SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"false"}},
 require:()=>({currentUser:async()=>{lookups++;return null;}}),Date},{timeout:3000});
 assert.equal(await m.exports.lifeTester(),null);
 assert.equal(lookups,0);
});
test("Life Coach model, history and page all enforce the same explicit rolling transition",()=>{
 for(const path of ["app/api/life/chat/route.ts","lib/lifeCoachStore.ts","app/life/page.tsx","app/page.tsx"]){
  assert.match(read(path),/SHARED_USAGE_MIGRATION_MODE/,path);
 }
 assert.match(read("app/page.tsx"),/rollingLife/);
 assert.match(read("app/page.tsx"),/complimentary launch allowance/);
 assert.doesNotMatch(read("app/page.tsx"),/Life Coach unlocks at your next verified membership renewal/);
 assert.match(read("app/api/life/chat/route.ts"),/next billing period/);
});

test("verified Life Coach sign-in restores an unlisted historical subscriber before checking existing access",async()=>{
 const js=ts.transpileModule(read("lib/lifeCoachAccess.ts"),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const calls=[],m={exports:{}},email="older-subscriber@example.test",id="user_VerifiedPrevious123";
 runInNewContext(js,{module:m,exports:m.exports,process:{env:rolling},Date,
  require:name=>{
   if(name==="@clerk/nextjs/server")return {currentUser:async()=>({
    id,primaryEmailAddressId:"e1",
    emailAddresses:[{id:"e1",emailAddress:email,verification:{status:"verified"}}]
   })};
   if(name==="./fitnessMembershipDb")return {
    getFitnessMembership:async()=>null,
    restoreVerifiedHistoricalBillingForMember:async(userEmail,userId)=>{
     calls.push(["restore",userEmail,userId]);return null;
    },
    memberHasFitnessAccess:async(userEmail,userId)=>{
     calls.push(["access",userEmail,userId]);return true;
    }
   };
   throw Error("unexpected import "+name);
  }
 },{timeout:3000});
 assert.equal(await m.exports.lifeTester(),id);
 assert.deepEqual(calls,[["restore",email,id],["access",email,id]]);
});
