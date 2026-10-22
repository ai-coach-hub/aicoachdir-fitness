import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../lib/previewVerifiedBillingAdapters.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const preview=()=>({
 VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/life-coach-agent-sandbox-20261011",
 LIFE_COACH_DATABASE_URL:"postgresql://private.invalid/isolated"
});
const binding={
 clerkUserId:"user_Account12345678", verifiedPrimaryEmail:"test@example.com",
 stripeCustomerId:"cus_Test123",stripeSubscriptionId:"sub_Test123",
 approvedPriceId:"price_Test123", approvedLedgerKey:"legacy_fitness_400",
 includedUses:400,allowedCoaches:["fitness","budgeting"]
};
function load({env=preview(),mode="test",dbBranch="br-autumn-breeze-auw38rgr",customerEmail=binding.verifiedPrimaryEmail,dbRows=[]}={}){
 const calls=[];const module={exports:{}};
 const sql=async(parts,...values)=>{
  const statement=parts.join(" ? ");calls.push({kind:"sql",statement,values});
  if(statement.includes("current_setting"))return [{branch_id:dbBranch}];
  if(statement.includes("preview_ai_usage_periods"))return dbRows;
  throw Error("Unexpected SQL");
 };
 runInNewContext(js,{module,exports:module.exports,require:(id)=>{
  if(id==="./stripeServer")return {
   stripeMode:()=>mode,
   stripeRequest:async path=>{
    calls.push({kind:"stripe",path});
    if(path.startsWith("/customers/"))return {email:customerEmail};
    if(path.startsWith("/subscriptions/"))return {
     id:binding.stripeSubscriptionId,customer:binding.stripeCustomerId,status:"active"
    };
    throw Error("Unexpected Stripe path");
   }
  };
  if(id==="@neondatabase/serverless")return {neon:url=>{
   assert.equal(url,env.LIFE_COACH_DATABASE_URL);return sql;
  }};
  throw Error("Unexpected import "+id);
 },process:{env}},{timeout:3000});
 return {api:module.exports,calls};
}

test("only isolated Preview + Stripe test mode can access either reader",async()=>{
 for(const args of [
  {env:{...preview(),VERCEL_ENV:"production"}},
  {env:{...preview(),VERCEL_GIT_COMMIT_REF:"main"}},
  {mode:"live"},{mode:"unknown"}
 ]){
  const x=load(args);
  await assert.rejects(x.api.readVerifiedPreviewStripeBilling(binding));
  await assert.rejects(x.api.readPrivatePriorUsagePeriod(binding.clerkUserId));
  assert.equal(x.calls.length,0);
 }
});

test("Stripe verifier reads customer then subscription with exact server binding",async()=>{
 const x=load();const data=await x.api.readVerifiedPreviewStripeBilling(binding);
 assert.equal(data.verifiedCustomerEmail,"test@example.com");
 assert.equal(data.subscription.id,binding.stripeSubscriptionId);
 assert.deepEqual(x.calls.map(z=>z.path),[
  "/customers/cus_Test123","/subscriptions/sub_Test123"
 ]);
});

test("customer mismatch blocks subscription request and never issues new paid access",async()=>{
 const x=load({customerEmail:"someone-else@example.com"});
 await assert.rejects(x.api.readVerifiedPreviewStripeBilling(binding),/does not match/);
 assert.equal(x.calls.filter(c=>c.kind==="stripe").length,1);
});

test("private ledger reader refuses wrong Neon branch before retrieving usage",async()=>{
 const x=load({dbBranch:"br_other"});
 await assert.rejects(x.api.readPrivatePriorUsagePeriod(binding.clerkUserId),/branch mismatch/);
 assert.equal(x.calls.filter(c=>c.kind==="sql").length,1);
});

test("private ledger reader returns prior period and cap without writes",async()=>{
 const x=load({dbRows:[{
  subscription_key:"legacy_fitness_400",period_start:"2026-10-01T00:00:00Z",
  period_end:"2026-11-01T00:00:00Z",limit_uses:400
 }]});
 const period=await x.api.readPrivatePriorUsagePeriod(binding.clerkUserId);
 assert.equal(period.allowanceLedgerKey,"legacy_fitness_400");
 assert.equal(period.includedUses,400);
 assert.equal(period.periodStart,"2026-10-01T00:00:00.000Z");
 assert.equal(period.clerkUserId,binding.clerkUserId);
 assert.equal(x.calls.filter(c=>c.kind==="sql").length,2);
 assert.match(x.calls.at(-1).statement,/WHERE member_id/);
});

test("no billing writes or model calls can originate from the adapters",()=>{
 assert.doesNotMatch(source,/(?:fetch\(|INSERT INTO|UPDATE fitness_|DELETE FROM|api\.pickaxe|\bPOST\b)/);
 assert.match(source,/stripeMode\(\)!=="test"/);
});
