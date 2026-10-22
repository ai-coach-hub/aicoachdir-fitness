import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=readFileSync(new URL("../lib/approvedExistingMemberLifeEntitlement.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const m={exports:{}};
runInNewContext(compiled,{module:m,exports:m.exports},{timeout:3000});
const {includeLifeForExistingMember:includeLife,
 EXISTING_MEMBER_MONTHLY_AI_USES,EXISTING_MEMBER_COACHES}=m.exports;
const oldBinding=()=>({
 clerkUserId:"user_ValidClerk001",
 verifiedPrimaryEmail:"current@example.test",
 stripeCustomerId:"cus_Legacy123",
 stripeSubscriptionId:"sub_Legacy123",
 approvedPriceId:"price_Current15",
 approvedLedgerKey:"legacy_fitness_400",
 includedUses:400,
 allowedCoaches:["fitness","budgeting"]
});
test("existing eligible member gets Life with unchanged $15 plan binding and 400 total uses",()=>{
 const original=oldBinding();
 const entitlement=includeLife(original,["price_Current15","price_Older15"]);
 assert.ok(entitlement);
 assert.deepEqual(Array.from(entitlement.allowedCoaches),["fitness","budgeting","life"]);
 assert.equal(entitlement.includedUses,EXISTING_MEMBER_MONTHLY_AI_USES);
 assert.equal(entitlement.approvedLedgerKey,original.approvedLedgerKey);
 assert.equal(entitlement.stripeSubscriptionId,original.stripeSubscriptionId);
 assert.equal(entitlement.clerkUserId,original.clerkUserId);
 assert.equal(original.allowedCoaches.includes("life"),false);
 assert.deepEqual(Array.from(EXISTING_MEMBER_COACHES),["fitness","budgeting","life"]);
});
test("older approved subscriber prices are included without a second subscription",()=>{
 const original={...oldBinding(),approvedPriceId:"price_Older15"};
 const updated=includeLife(original,["price_Current15","price_Older15"]);
 assert.equal(updated?.stripeCustomerId,original.stripeCustomerId);
 assert.equal(updated?.stripeSubscriptionId,original.stripeSubscriptionId);
 assert.equal(updated?.approvedLedgerKey,original.approvedLedgerKey);
});
test("unapproved, missing or malformed prices never gain the new coach",()=>{
 const old=oldBinding();
 for(const prices of [[],["price_Other"],["not_a_price"],["price_Current15","invalid"]])
  assert.equal(includeLife(old,prices),null);
 assert.equal(includeLife({...old,approvedPriceId:"price_Surprise"},["price_Current15"]),null);
});
test("cannot mint a second wallet, inflate uses or grant unreleased Career",()=>{
 const old=oldBinding();
 for(const change of [
  {includedUses:800},{includedUses:200},
  {approvedLedgerKey:""},
  {allowedCoaches:["fitness","budgeting","career"]},
  {allowedCoaches:["fitness"]},
  {allowedCoaches:["life"]},
  {allowedCoaches:[]}
 ]) assert.equal(includeLife({...old,...change},["price_Current15"]),null);
 assert.deepEqual(Array.from(includeLife({...old,allowedCoaches:["fitness","budgeting","life"]},["price_Current15"]).allowedCoaches),["fitness","budgeting","life"]);
});
test("entitlement module has no live external system mutations",()=>{
 assert.doesNotMatch(source,/\bfetch\(|\bstripeRequest\(|\bneon\(|\bINSERT\b|\bUPDATE\b|api\.pickaxe/);
});
