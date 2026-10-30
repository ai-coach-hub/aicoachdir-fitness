import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const js=ts.transpileModule(readFileSync("lib/productionPaidInvoiceGuard.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function("module","exports",js)(mod,mod.exports);
const check=mod.exports.verifyPaidUpgradeInvoice;
const good=()=>({signedWebhook:true,liveMode:true,eventType:"invoice.paid",invoiceId:"in_ABC123",invoiceStatus:"paid",invoicePaid:true,invoiceSubscriptionId:"sub_ABC123",invoiceCustomerId:"cus_ABC123",intentInvoiceId:"in_ABC123",intentSubscriptionId:"sub_ABC123",intentCustomerId:"cus_ABC123",intentState:"awaiting_payment",originalPriceId:"price_Old123",expectedPriceId:"price_New123",observedStripePriceId:"price_New123",walletPeriodMatches:true,walletLimitMatches:true});
test("accepts fully bound paid proof only",()=>assert.deepEqual(check(good()),{ok:true}));
for(const [label,change,reason] of [
 ["unsigned",{signedWebhook:false},"untrusted_event"],
 ["test-mode",{liveMode:false},"untrusted_event"],
 ["wrong event",{eventType:"invoice.payment_failed"},"untrusted_event"],
 ["unpaid invoice",{invoiceStatus:"open"},"invoice_not_confirmed"],
 ["invoice mismatch",{intentInvoiceId:"in_OTHER"},"invoice_not_confirmed"],
 ["wrong subscription",{invoiceSubscriptionId:"sub_WRONG"},"subscription_binding_mismatch"],
 ["wrong customer",{invoiceCustomerId:"cus_WRONG"},"subscription_binding_mismatch"],
 ["replay",{intentState:"applied"},"intent_not_payable"],
 ["unchanged price",{expectedPriceId:"price_Old123",observedStripePriceId:"price_Old123"},"price_change_unverified"],
 ["wrong price",{observedStripePriceId:"price_OTHER"},"price_change_unverified"],
 ["wrong period",{walletPeriodMatches:false},"wallet_changed"],
 ["changed wallet",{walletLimitMatches:false},"wallet_changed"],
])test(label,()=>assert.equal(check({...good(),...change}).reason,reason));
