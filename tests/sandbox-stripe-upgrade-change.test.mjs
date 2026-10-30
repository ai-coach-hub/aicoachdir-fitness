import test from "node:test";
import assert from "node:assert/strict";
import {buildSandboxStripeUpgradeChange} from "../lib/sandboxStripeUpgradeChange.ts";
const inp={subscriptionId:"sub_SYNTHETIC1234",itemId:"si_SYNTHETIC1234",targetPriceId:"price_SYNTHETIC5678",intentId:"upg_"+"a".repeat(36)};
const safe={vercelEnv:"preview",branch:"feature/verified-subscription-upgrade-policy-20261027",mode:"test",enabled:"true"};
test("sandbox upgrade request invoices proration without resetting period or instantly granting allowance",()=>{
 const r=buildSandboxStripeUpgradeChange(inp,safe);
 assert.equal(r.ok,true);
 if(!r.ok)return;
 assert.equal(r.body.get("payment_behavior"),"pending_if_incomplete");
 assert.equal(r.body.get("proration_behavior"),"always_invoice");
 assert.equal(r.body.get("billing_cycle_anchor[type]"),"unchanged");
 assert.equal(r.body.get("items[0][id]"),inp.itemId);
 assert.equal(r.body.get("items[0][price]"),inp.targetPriceId);
 assert.equal(r.body.has("metadata[member_key]"),false);
});
test("sandbox upgrade request rejects any production configuration or invalid binding",()=>{
 for(const e of [{...safe,mode:"live"},{...safe,vercelEnv:"production"},{...safe,enabled:"false"},{...safe,branch:"main"}])
  assert.equal(buildSandboxStripeUpgradeChange(inp,e).ok,false);
 assert.equal(buildSandboxStripeUpgradeChange({...inp,intentId:"upg_fake"},safe).ok,false);
});
