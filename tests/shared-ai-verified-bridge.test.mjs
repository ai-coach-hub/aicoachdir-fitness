import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const cache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name);
 const raw=readFileSync(new URL("../lib/"+name+".ts",import.meta.url),"utf8");
 const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 runInNewContext(js,{module,exports:module.exports,require:(path)=>{
   if(path.startsWith("./"))return load(path.slice(2));
   throw Error("Unexpected import: "+path);
 }},{timeout:3000});
 cache.set(name,module.exports);
 return module.exports;
}
const {checkVerifiedSharedUsage:check}=load("sharedAiVerifiedUsageBridge");
const now="2026-10-21T12:00:00.000Z";
const binding={
 clerkUserId:"user_AccountAbc12345",
 verifiedPrimaryEmail:"member@example.com",
 stripeCustomerId:"cus_Test123",
 stripeSubscriptionId:"sub_Test123",
 approvedPriceId:"price_Test123",
 approvedLedgerKey:"legacy_fitness_400",
 includedUses:400,
 allowedCoaches:["fitness","budgeting","life"]
};
const subscription=()=>({
 id:binding.stripeSubscriptionId,
 customer:binding.stripeCustomerId,
 status:"active",
 cancel_at_period_end:true,
 items:{has_more:false,data:[{
  price:{id:binding.approvedPriceId,recurring:{interval:"month",interval_count:1}},
  current_period_start:Date.parse("2026-10-01T00:00:00.000Z")/1000,
  current_period_end:Date.parse("2026-11-01T00:00:00.000Z")/1000,
 }]}
});
const request={authenticatedClerkUserId:binding.clerkUserId,coach:"fitness",requestKey:"request-abcdefghi1234",now};
function deps(overrides={}){
 const calls=[];
 return {calls,handlers:{
  lookupBilling:async()=>{calls.push("billing");return {
   verifiedCustomerEmail:binding.verifiedPrimaryEmail,
   verifiedAt:"2026-10-21T11:59:00.000Z",
   subscription:subscription()
  };},
  lookupPriorPeriod:async()=>{calls.push("ledger");return null;},
  ...overrides
 }};
}

test("verified paid-through member passes using Stripe item dates, never purchases",async()=>{
 const d=deps();
 const result=await check(binding,request,d.handlers);
 assert.equal(result.allowed,true);
 assert.equal(result.limitUses,400);
 assert.equal(result.periodEnd,"2026-11-01T00:00:00.000Z");
 assert.deepEqual(d.calls,["billing","ledger"]);
});

test("current members include Life, while Career and forged Clerk identities fail closed",async()=>{
 const d=deps();
 const life=await check(binding,{...request,coach:"life"},d.handlers);
 assert.equal(life.allowed,true);
 assert.equal(life.limitUses,400);
 assert.equal(life.subscriptionKey,binding.approvedLedgerKey);
 assert.equal((await check(binding,{...request,coach:"career"},d.handlers)).reason,"coach_not_included");
 const wrong=deps();
 assert.equal((await check(binding,{...request,authenticatedClerkUserId:"user_OtherAccount22"},wrong.handlers)).reason,"invalid_identity");
 assert.equal(wrong.calls.length,0);
});

test("rejects mismatched customer, wrong price and inactive status",async()=>{
 const orig=deps();
 const wrongCustomer=deps({lookupBilling:async()=>({
   verifiedCustomerEmail:"other@example.com",verifiedAt:now,subscription:subscription()
 })});
 assert.equal((await check(binding,request,wrongCustomer.handlers)).reason,"billing_unverified");
 const wrongPrice=deps({lookupBilling:async()=>({
   verifiedCustomerEmail:binding.verifiedPrimaryEmail,verifiedAt:now,
   subscription:{...subscription(),items:{has_more:false,data:[{
    price:{id:"price_Wrong123",recurring:{interval:"month",interval_count:1}},
    current_period_start:Date.parse("2026-10-01")/1000,
    current_period_end:Date.parse("2026-11-01")/1000
   }]}}
 })});
 assert.equal((await check(binding,request,wrongPrice.handlers)).reason,"billing_unverified");
 const canceled=deps({lookupBilling:async()=>({
   verifiedCustomerEmail:binding.verifiedPrimaryEmail,verifiedAt:now,
   subscription:{...subscription(),status:"canceled"}
 })});
 assert.equal((await check(binding,request,canceled.handlers)).reason,"subscription_inactive");
 assert.ok(orig);
});

test("ledger outage blocks access, no implicit fresh allowance",async()=>{
 const d=deps({lookupPriorPeriod:async()=>{throw Error("offline")}});
 assert.equal((await check(binding,request,d.handlers)).reason,"billing_unverified");
});

test("reactivation with overlapping ledger period does not double grant usage",async()=>{
 const old={clerkUserId:binding.clerkUserId,allowanceLedgerKey:"legacy_fitness_400",
 includedUses:400,periodStart:"2026-10-01T00:00:00.000Z",
 periodEnd:"2026-11-01T00:00:00.000Z"};
 const d=deps({lookupPriorPeriod:async()=>({...old,allowanceLedgerKey:"different_plan"})});
 assert.equal((await check(binding,request,d.handlers)).reason,"overlapping_period");
});

test("bridge performs no direct Stripe/Neon/Pickaxe calls",()=>{
 const src=readFileSync(new URL("../lib/sharedAiVerifiedUsageBridge.ts",import.meta.url),"utf8");
 assert.doesNotMatch(src,/\bfetch\(|\bstripeRequest\(|\bneon\(|api\.pickaxe|INSERT INTO|UPDATE [a-z]/);
});
