import {neon} from "@neondatabase/serverless";
import {stripeMode,stripeRequest} from "./stripeServer";
import {reconcilePaidUpgradeNotification} from "./upgradeWebhookReconciler";
import type {PaidUpgradeReceipt} from "./paidUpgradeReconciliation";
import type {WalletBefore} from "./upgradeWalletTransition";

// TEST ENVIRONMENT ONLY. No production fallback and no live Stripe key.
// Never use billing-email/metadata to infer the member from a webhook.
export async function processSandboxPaidUpgradeWebhook(args:{
 eventType:string;invoiceId:string;
}):Promise<"ignored"|"applied"|"already_applied"|"retry">{
 if(process.env.VERCEL_ENV!=="preview" ||
    process.env.UPGRADE_SANDBOX_WEBHOOK_ENABLED!=="true" ||
    stripeMode()!=="test" ||
    !/^in_[A-Za-z0-9]+$/.test(args.invoiceId))return "ignored";
 const url=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 if(!url)throw new Error("Isolated upgrade test database URL missing");
 const sql=neon(url);
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(String(branch[0]?.id||"")!=="br-young-salad-aubnf7xt")
   throw new Error("Upgrade webhook database is not isolated");
 const intents=await sql`SELECT id,member_key,entitlement_key,period_start,period_end,
 stripe_customer_id,stripe_subscription_id,stripe_item_id,old_price_id,
 target_price_id,expected_limit,target_limit,invoice_id,state
 FROM public.ai_upgrade_intents WHERE invoice_id=${args.invoiceId} LIMIT 2`;
 // A paid subscription-update invoice can arrive before the upgrade caller
 // has persisted its invoice ID. Fail retryably only when its subscription
 // has a uniquely prepared/awaiting-payment intent; unrelated invoices stay ignored.
 if(intents.length===0){
  const invoice=await stripeRequest("/invoices/"+encodeURIComponent(args.invoiceId));
  const parent=invoice.parent&&typeof invoice.parent==="object"?
   invoice.parent as Record<string,unknown>:{};
  const details=parent.subscription_details&&typeof parent.subscription_details==="object"?
   parent.subscription_details as Record<string,unknown>:{};
  const subscriptionId=String(invoice.subscription||details.subscription||"");
  if(invoice.billing_reason!=="subscription_update"||
   invoice.status!=="paid"||invoice.livemode!==false||
   !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))return "ignored";
  const pending=await sql`SELECT id FROM public.ai_upgrade_intents
   WHERE stripe_subscription_id=${subscriptionId}
   AND state IN ('prepared','awaiting_payment') LIMIT 2`;
  if(pending.length===1)throw new Error("Invoice binding pending; retry signed delivery");
  return "ignored";
 }
 if(intents.length!==1)throw new Error("Ambiguous invoice intent mapping");
 const intent=intents[0];
 if(intent.state==="applied")return "already_applied";
 if(intent.state!=="awaiting_payment")return "ignored";
 const wallets=await sql`SELECT member_key,entitlement_key,period_start,period_end,
 limit_uses,completed_uses,reserved_uses
 FROM public.shared_ai_usage_periods
 WHERE member_key=${intent.member_key}
 AND entitlement_key=${intent.entitlement_key}
 AND period_start=${intent.period_start}::timestamptz LIMIT 2`;
 if(wallets.length!==1)throw new Error("Missing unique upgrade wallet");
 const w=wallets[0];
 const iso=(v:unknown)=>new Date(String(v)).toISOString();
 const wallet:WalletBefore={
 memberKey:String(w.member_key),entitlementKey:String(w.entitlement_key),
 periodStart:iso(w.period_start),periodEnd:iso(w.period_end),
 limitUses:Number(w.limit_uses),completedUses:Number(w.completed_uses),
 reservedUses:Number(w.reserved_uses)};
 const receipt:PaidUpgradeReceipt={
 invoiceId:String(intent.invoice_id),customerId:String(intent.stripe_customer_id),
 subscriptionId:String(intent.stripe_subscription_id),
 subscriptionItemId:String(intent.stripe_item_id),
 oldPriceId:String(intent.old_price_id),targetPriceId:String(intent.target_price_id),
 targetLimitUses:Number(intent.target_limit)};
 const outcome=await reconcilePaidUpgradeNotification({
  eventType:args.eventType,eventInvoiceId:args.invoiceId,
  storedIntent:receipt,verifiedMemberKey:String(intent.member_key),wallet,
  fetchStripeInvoice:async(id)=>stripeRequest("/invoices/"+encodeURIComponent(id)),
  fetchStripeSubscription:async(id)=>stripeRequest("/subscriptions/"+encodeURIComponent(id)),
  applyWalletIncrease:async(expected,target)=>{
   if(expected!==Number(intent.expected_limit)||target!==Number(intent.target_limit))
     return "mismatch";
   const result=await sql`SELECT public.shared_ai_apply_paid_upgrade(
    ${intent.id},${args.invoiceId},${expected},${target}) AS status`;
   return String(result[0]?.status||"unavailable");
  }
 });
 if(!outcome.ok)throw new Error("Upgrade reconciliation rejected: "+outcome.reason);
 return "applied";
}
