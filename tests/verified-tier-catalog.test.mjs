import test from "node:test";
import assert from "node:assert/strict";
import {verifiedTierCatalog} from "../lib/verifiedTierCatalog.ts";
const prices=[
 {tier:"starter",stripePriceId:"price_StArTeR01",monthlyUsdCents:900,includedMessages:100,currency:"usd",interval:"month",active:true},
 {tier:"growth",stripePriceId:"price_GrOwTh002",monthlyUsdCents:1500,includedMessages:200,currency:"usd",interval:"month",active:true},
 {tier:"premium",stripePriceId:"price_PrEmIuM3",monthlyUsdCents:2500,includedMessages:400,currency:"usd",interval:"month",active:true},
 {tier:"elite",stripePriceId:"price_ElItE0004",monthlyUsdCents:3500,includedMessages:600,currency:"usd",interval:"month",active:true},
];
test("catalog accepts only four explicit approved prices in the right Stripe environment",()=>{
 const r=verifiedTierCatalog({environment:"test",prices},"test");
 assert.equal(r.ok,true);if(r.ok)assert.deepEqual(r.catalog.map(x=>x.includedMessages),[100,200,400,600]);
});
test("catalog rejects live/test mixups, unknown prices, wrong costs and duplicates",()=>{
 assert.equal(verifiedTierCatalog({environment:"test",prices},"live").ok,false);
 assert.equal(verifiedTierCatalog({environment:"test",prices:[]}, "test").ok,false);
 for(const item of [
 {...prices[0],monthlyUsdCents:1500},
 {...prices[0],includedMessages:999},
 {...prices[0],currency:"eur"},
 {...prices[0],interval:"year"},
 {...prices[0],active:false},
 {...prices[0],stripePriceId:prices[1].stripePriceId}
 ]){
  assert.equal(verifiedTierCatalog({environment:"test",prices:[item,...prices.slice(1)]},"test").ok,false);
 }
});
