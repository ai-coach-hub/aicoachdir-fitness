import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const cache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name);
 const raw=readFileSync(new URL("../lib/"+name+".ts",import.meta.url),"utf8");
 const js=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 runInNewContext(js,{module:mod,exports:mod.exports,require:p=>{if(!p.startsWith("./"))throw Error("external module");return load(p.slice(2));}},{timeout:3000});
 cache.set(name,mod.exports);return mod.exports;
}
const {legacyLifeVerifiedBinding:bind}=load("legacyLifeVerifiedBinding");
const session={clerkUserId:"user_member11111111",verifiedPrimaryEmail:"member@example.com"};
const row={
 email:"member@example.com",clerk_user_id:session.clerkUserId,
 stripe_customer_id:"cus_Customer1",stripe_subscription_id:"sub_Subscription1",
 stripe_status:"active",access_active:true
};
const price="price_Legacy123";
test("valid active subscriber binds Life Coach to unchanged single 400-use ledger",()=>{
 const result=bind(row,session,price);
 assert.ok(result);
 assert.equal(result.includedUses,400);
 assert.equal(result.approvedLedgerKey,"approved_fitness_v2_legacy");
 assert.deepEqual([...result.allowedCoaches],["fitness","budgeting","life"]);
 assert.equal(result.stripeSubscriptionId,row.stripe_subscription_id);
});
test("fail closed for cross-account, inactive, lapsed, unsigned, unverified IDs",()=>{
 const attempts=[
  [{...row,clerk_user_id:"user_intruder1111111"},session,price],
  [{...row,email:"another@example.com"},session,price],
  [{...row,stripe_status:"canceled"},session,price],
  [{...row,access_active:false},session,price],
  [{...row,stripe_customer_id:null},session,price],
  [{...row,stripe_subscription_id:"invalid"},session,price],
  [row,{...session,verifiedPrimaryEmail:"intruder@example.com"},price],
  [row,session,""],
  [null,session,price]
 ];
 for(const [r,s,p] of attempts)assert.equal(bind(r,s,p),null);
});
test("pure binding never grants access or contacts Stripe",()=>{
 const src=readFileSync(new URL("../lib/legacyLifeVerifiedBinding.ts",import.meta.url),"utf8");
 assert.doesNotMatch(src,/\b(?:fetch|stripeRequest|neon|grantFitnessAccess)\s*\(/);
});
