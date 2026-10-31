/**
 * Side-effect-free guard for a Stripe invoice.paid upgrade event.
 * A signed webhook and a durable matching upgrade intent are prerequisites;
 * this guard does not trust webhook metadata or grant allowances itself.
 */
export type PaidInvoiceProof={
 signedWebhook:boolean;
 liveMode:boolean;
 eventType:string;
 invoiceId:string;
 invoiceStatus:string;
 invoicePaid:boolean;
 invoiceSubscriptionId:string;
 invoiceCustomerId:string;
 intentInvoiceId:string;
 intentSubscriptionId:string;
 intentCustomerId:string;
 intentState:string;
 originalPriceId:string;
 expectedPriceId:string;
 observedStripePriceId:string;
 walletPeriodMatches:boolean;
 walletLimitMatches:boolean;
};
export type InvoiceProofResult={ok:true}|{ok:false;reason:string};
const stripeId=(v:string,prefix:string)=>new RegExp("^"+prefix+"_[A-Za-z0-9]+$").test(v);
export function verifyPaidUpgradeInvoice(p:PaidInvoiceProof):InvoiceProofResult{
 const deny=(reason:string):InvoiceProofResult=>({ok:false,reason});
 if(!p.signedWebhook||!p.liveMode||p.eventType!=="invoice.paid")return deny("untrusted_event");
 if(!stripeId(p.invoiceId,"in")||p.invoiceId!==p.intentInvoiceId||
 p.invoiceStatus!=="paid"||!p.invoicePaid)return deny("invoice_not_confirmed");
 if(!stripeId(p.invoiceSubscriptionId,"sub")||
 p.invoiceSubscriptionId!==p.intentSubscriptionId||
 !stripeId(p.invoiceCustomerId,"cus")||
 p.invoiceCustomerId!==p.intentCustomerId)return deny("subscription_binding_mismatch");
 if(p.intentState!=="awaiting_payment")return deny("intent_not_payable");
 if(!stripeId(p.originalPriceId,"price")||
 !stripeId(p.expectedPriceId,"price")||
 p.originalPriceId===p.expectedPriceId||
 p.observedStripePriceId!==p.expectedPriceId)return deny("price_change_unverified");
 if(!p.walletPeriodMatches||!p.walletLimitMatches)return deny("wallet_changed");
 return {ok:true};
}
