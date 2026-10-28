import test from "node:test";
import assert from "node:assert/strict";
import {sandboxTierCatalogFor} from "../lib/sandboxTierManifest.ts";
test("verified test Stripe prices map to exactly the approved four-tier allowances",()=>{
 const result=sandboxTierCatalogFor("preview","test");
 assert.equal(result.ok,true);
 if(result.ok)assert.deepEqual(result.catalog.map(x=>[x.tier,x.monthlyUsdCents,x.includedMessages]),[
 ["starter",900,100],["growth",1500,200],["premium",2500,400],["elite",3500,600]]);
});
test("sandbox catalog fails closed outside preview test mode",()=>{
 assert.equal(sandboxTierCatalogFor("production","test").ok,false);
 assert.equal(sandboxTierCatalogFor("preview","live").ok,false);
});
