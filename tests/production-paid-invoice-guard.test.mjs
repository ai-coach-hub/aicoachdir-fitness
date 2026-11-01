import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const js=ts.transpileModule(readFileSync("lib/productionPaidInvoiceGuard.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function("module","exports",js)(mod,mod.exports);
const check=mod.exports.verifyPaidUpgradeInvoice;
const good=()=>({signedWebhook:true,liveMode:true,eventType:"invoice.paid",invoiceId:"in_ABC123",invoiceStatus:"paid",invoicePaidAt:1793500696,invoiceAmountRemaining:0,invoiceSubscriptionId:"sub_ABC123",invoiceCustomerId:"cus_ABC123",intentInvoiceId:"in_ABC123",intentSubscriptionId:"sub_ABC123",intentCustomerId:"cus_ABC123",intentState:"awaiting_payment",originalPriceId:"price_Old123",expectedPriceId:"price_New123",observedStripePriceId:"price_New123",walletPeriodMatches:true,walletLimitMatches:true});
test("accepts fully bound paid proof only",()=>assert.deepEqual(check(good()),{ok:true}));
for(const [label,change,reason] of [
 ["unsigned",{signedWebhook:false},"untrusted_event"],
 ["test-mode",{liveMode:false},"untrusted_event"],
 ["wrong event",{eventType:"invoice.payment_failed"},"untrusted_event"],
 ["unpaid invoice",{invoiceStatus:"open"},"invoice_not_confirmed"],
 ["missing paid timestamp",{invoicePaidAt:0},"invoice_not_confirmed"],
 ["remaining balance",{invoiceAmountRemaining:1},"invoice_not_confirmed"],
 ["invoice mismatch",{intentInvoiceId:"in_OTHER"},"invoice_not_confirmed"],
 ["wrong subscription",{invoiceSubscriptionId:"sub_WRONG"},"subscription_binding_mismatch"],
 ["wrong customer",{invoiceCustomerId:"cus_WRONG"},"subscription_binding_mismatch"],
 ["replay",{intentState:"applied"},"intent_not_payable"],
 ["unchanged price",{expectedPriceId:"price_Old123",observedStripePriceId:"price_Old123"},"price_change_unverified"],
 ["wrong price",{observedStripePriceId:"price_OTHER"},"price_change_unverified"],
 ["wrong period",{walletPeriodMatches:false},"wallet_changed"],
 ["changed wallet",{walletLimitMatches:false},"wallet_changed"],
])test(label,()=>assert.equal(check({...good(),...change}).reason,reason));


const renewal = mod.exports.isVerifiedPaidRenewalInvoice;
const renewalInvoice=()=>({object:"invoice",livemode:true,status:"paid",billing_reason:"subscription_cycle",
 status_transitions:{paid_at:1793500696},amount_remaining:0});
test("current renewal invoice shape without paid boolean is accepted",()=>{
 assert.equal(renewal(renewalInvoice(),true),true);
});
for (const [label,change] of [
 ["wrong mode",{livemode:false}],["open",{status:"open"}],
 ["missing transition",{status_transitions:{paid_at:null}}],
 ["invalid timestamp",{status_transitions:{paid_at:0}}],
 ["remaining balance",{amount_remaining:1}],
 ["not a renewal",{billing_reason:"subscription_update"}],
 ["not an invoice",{object:"payment_intent"}]
])test("renewal proof rejects "+label,()=>assert.equal(renewal({...renewalInvoice(),...change},true),false));
test("renewal reconciliation is wired to verified invoice proof",()=>{
 const source=readFileSync("lib/tierRenewalReconciler.ts","utf8");
 assert.match(source,/if\(!isVerifiedPaidRenewalInvoice\(invoice,live\)\)return 'ignored';/);
 assert.doesNotMatch(source,/invoice\.paid\s*!==\s*true/);
});
