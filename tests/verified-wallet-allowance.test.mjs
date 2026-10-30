import test from "node:test";
import assert from "node:assert/strict";
import {resolveVerifiedWalletAllowance} from "../lib/verifiedWalletAllowance.ts";
const legacy="price_Legacy123",catalog=[
 {tier:"starter",stripePriceId:"price_Starter101",monthlyUsdCents:900,includedMessages:100},
 {tier:"growth",stripePriceId:"price_Growth202",monthlyUsdCents:1500,includedMessages:200},
 {tier:"premium",stripePriceId:"price_Premium303",monthlyUsdCents:2500,includedMessages:400},
 {tier:"elite",stripePriceId:"price_Elite404",monthlyUsdCents:3500,includedMessages:600}
];
const run=(changes={})=>resolveVerifiedWalletAllowance({verifiedStripePriceId:legacy,verifiedLegacyPriceIds:[legacy],verifiedCatalog:catalog,...changes});
test("grandfathered original members retain 400",()=>{const r=run();assert.equal(r.ok,true);if(r.ok)assert.equal(r.limitUses,400);});
test("new tier allowances derive only from approved Stripe price mapping",()=>{
 for(const [p,n] of catalog.map(x=>[x.stripePriceId,x.includedMessages])){
 const r=run({verifiedStripePriceId:p});assert.equal(r.ok,true);if(r.ok)assert.equal(r.limitUses,n);
 }
});
test("paid upgrade does not silently mint messages before same-period database reconciliation",()=>{
 const r=run({verifiedStripePriceId:catalog[3].stripePriceId,priorWallet:{entitlementKey:"existing_400_v1",limitUses:400}});
 assert.deepEqual(r,{ok:false,reason:"wallet_payment_reconciliation_required"});
});
test("unknown catalog or conflicting legacy tier fails closed",()=>{
 assert.equal(run({verifiedStripePriceId:"price_Unknown333"}).ok,false);
 assert.equal(run({verifiedCatalog:[...catalog,{...catalog[0],stripePriceId:legacy}]}).ok,false);
});
