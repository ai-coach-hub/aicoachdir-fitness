import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const raw=readFileSync(new URL("../lib/sharedUsagePriceApproval.ts",import.meta.url),"utf8");
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
runInNewContext(js,{module:mod,exports:mod.exports},{timeout:3000});
const {approvedSharedPriceIds:approved}=mod.exports;
const current="price_Live15Monthly123";
const previous="price_OlderMember15";
const ids=x=>Array.from(x);
test("production recognizes current $15 price from existing trusted billing config without new env setup",()=>{
 assert.deepEqual(ids(approved({environment:"production",billingCurrentPrice:current,extraApprovedPrices:""})),[current]);
});
test("explicit vetted older subscriber prices remain eligible without changing live plan",()=>{
 const a=approved({environment:"production",billingCurrentPrice:current,
  extraApprovedPrices:""+previous+","+current});
 assert.deepEqual(ids(a),[current,previous]);
});
test("invalid production current price blocks all allowances instead of guessing",()=>{
 for(const v of [null,"","price_bogus; DROP TABLE",42]){
  assert.equal(approved({environment:"production",billingCurrentPrice:v,
   extraApprovedPrices:previous}).length,0);
 }
});
test("preview never inherits live approved price and must use explicit test price ids",()=>{
 assert.deepEqual(ids(approved({environment:"preview",billingCurrentPrice:current,
   extraApprovedPrices:previous})),[previous]);
 assert.deepEqual(ids(approved({environment:"preview",billingCurrentPrice:current,
   extraApprovedPrices:""})),[]);
});
test("malformed explicit price allowlist denies rather than silently narrowing eligible members",()=>{
 for(const bad of ["price_Legit,invalid","price_Legit,,price_Older","price_Legit;price_Older"]){
  assert.deepEqual(ids(approved({environment:"production",billingCurrentPrice:current,
    extraApprovedPrices:bad})),[]);
 }
});
test("current approval comes from exact production billing config key; no Stripe product creation",()=>{
 const meter=readFileSync(new URL("../lib/sharedUsageMeter.ts",import.meta.url),"utf8");
 assert.match(meter,/stripe_fitness_price_id:live/);
 assert.match(meter,/approvedSharedPriceIds/);
 assert.doesNotMatch(meter,/ensureFitnessPriceId\(/);
});
