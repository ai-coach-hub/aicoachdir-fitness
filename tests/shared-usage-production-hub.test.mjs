import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {createHmac,timingSafeEqual} from "node:crypto";
import ts from "typescript";

function load(path,modules,extras={}){
 const code=readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 runInNewContext(js,{module:m,exports:m.exports,require:name=>{
  assert.ok(name in modules,"unexpected dependency "+name);
  return modules[name];
 },Buffer,Response,Request,Date,process:{env:{}},...extras},{timeout:3000});
 return m.exports;
}
const contract=load("lib/shared-usage-service.ts",{"node:crypto":{createHmac,timingSafeEqual}});
const secret="test-only-private-service-secret-longer-than-32";
function command(action="reserve",outcome=null){
 return {version:1,audience:"aicoachdir-usage-hub",actor:"budgeting",
  action,memberEmail:"member@example.test",requestKey:"budget-request-123456789",
  outcome,issuedAt:Date.now()};
}
function signedRequest(event,valid=true){
 const signature=contract.signSharedUsageServiceRequest(event,secret);
 return new Request("https://example.test/api/internal/shared-usage",{
  method:"POST",headers:{"Content-Type":"application/json",
   "x-shared-usage-signature":valid?signature:"f".repeat(64)},
  body:JSON.stringify(event)
 });
}
function server(env,options={}){
 const calls=[];
 const modules={
  "@/lib/shared-usage-service":contract,
  "@/lib/previewSharedMemberBinding":{
   resolvePrivatePreviewBudgetMember:async email=>{calls.push(["private-member",email]);return "user_preview";}
  },
  "@/lib/previewLifeTestEnrollment":{
   lifeTestStatus:async member=>{calls.push(["private-enrollment",member]);return {active:true};},
   previewTestAvailable:()=>env.VERCEL_ENV==="preview"&&env.PREVIEW_SHARED_USAGE_METER_ENABLED==="true",
   previewLifeTestPeriod:"2026-10-20T00:00:00.000Z",
   previewLifeTestSubscription:"preview-synthetic-period"
  },
  "@/lib/previewAiUsage":{
   reservePreviewAiUse:async()=>{calls.push(["preview-reserve"]);return "reserved";},
   settlePreviewAiUse:async()=>{calls.push(["preview-settle"]);return "completed";}
  },
  "@/lib/sharedUsageMeter":{
   sharedUsageGateEnabled:()=>env.SHARED_USAGE_GATE_ENABLED==="true"&&
    env.VERCEL_ENV==="production"&&env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true",
   reserveSharedUsage:async(...args)=>{calls.push(["reserve",...args]);
    if(options.fail)throw Error("ledger unavailable");
    return {status:options.reserveStatus||"reserved"};
   },
   settleSharedUsage:async(...args)=>{calls.push(["settle",...args]);
    if(options.fail)throw Error("ledger unavailable");
    return options.settleStatus||"completed";
   }
  }
 };
 const hub=load("app/api/internal/shared-usage/route.ts",modules,{
  process:{env:{...env,BUDGET_MEMBERSHIP_HANDOFF_SECRET:secret}}
 });
 return {post:hub.POST,calls};
}
const live={VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true",SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true"};

test("production hub reserves Budgeting requests only after signed authentication and release",async()=>{
 const s=server(live),event=command();
 const res=await s.post(signedRequest(event));
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{ok:true,result:"reserved",mode:"shared-wallet"});
 assert.deepEqual(s.calls,[["reserve",event.memberEmail,"budgeting",event.requestKey]]);
});

test("production hub verifies signed settlement and the intended outcome",async()=>{
 const s=server(live,{settleStatus:"already_released"});
 const event=command("settle","released");
 const res=await s.post(signedRequest(event));
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).result,"already_released");
 assert.deepEqual(s.calls,[["settle",event.memberEmail,"budgeting",event.requestKey,"released"]]);
});

test("production hub denies disabled release, invalid signatures, and forged outcomes before ledger writes",async()=>{
 for(const env of [{VERCEL_ENV:"production",SHARED_USAGE_GATE_ENABLED:"true"},
  {VERCEL_ENV:"production",SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true"},
  {VERCEL_ENV:"development",SHARED_USAGE_GATE_ENABLED:"true",SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true"}]){
  const s=server(env),res=await s.post(signedRequest(command()));
  assert.equal(res.status,404);assert.equal(s.calls.length,0);
 }
 const s=server(live);
 const bad=await s.post(signedRequest(command(),false));
 assert.equal(bad.status,401);assert.equal(s.calls.length,0);
 const forged={...command("settle","completed"),outcome:"released"};
 const signature=contract.signSharedUsageServiceRequest({...forged,outcome:"completed"},secret);
 const request=new Request("https://example.test/api/internal/shared-usage",{
  method:"POST",headers:{"Content-Type":"application/json","x-shared-usage-signature":signature},
  body:JSON.stringify(forged)
 });
 assert.equal((await s.post(request)).status,401);assert.equal(s.calls.length,0);
});

test("production hub reports exhausted or unavailable quota without granting usage",async()=>{
 const denied=server(live,{reserveStatus:"exhausted"});
 const exhausted=await denied.post(signedRequest(command()));
 assert.equal(exhausted.status,429);
 assert.deepEqual((await exhausted.json()).result,"exhausted");
 const offline=server(live,{fail:true});
 const down=await offline.post(signedRequest(command()));
 assert.equal(down.status,503);
 assert.equal((await down.json()).ok,false);
});

test("preview Budgeting meter remains on synthetic member binding, never live ledger",async()=>{
 const preview=server({VERCEL_ENV:"preview",PREVIEW_SHARED_USAGE_METER_ENABLED:"true",
  SHARED_USAGE_GATE_ENABLED:"true",SHARED_USAGE_PUBLIC_RELEASE_APPROVED:"true"});
 const res=await preview.post(signedRequest(command()));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.mode,"isolated-preview-only");
 assert.deepEqual(preview.calls[0],["private-member","member@example.test"]);
 assert.ok(preview.calls.some(x=>x[0]==="preview-reserve"));
 assert.ok(!preview.calls.some(x=>x[0]==="reserve"));
});
