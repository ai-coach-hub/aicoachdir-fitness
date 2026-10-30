import {neon} from "@neondatabase/serverless";
import {stripeMode,stripeRequest} from "./stripeServer";
import {verifiedSandboxStripeAccount} from "./sandboxStripeAccountGuard";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {buildSandboxStripeUpgradeChange} from "./sandboxStripeUpgradeChange";
import {processSandboxPaidUpgradeWebhook} from "./sandboxPaidUpgradeWebhook";
/** Isolated preview only. Never trusts browser-owned Stripe IDs or wallet limits.
 * Reserve an intent before Stripe mutation. On transient failures repeat only
 * with the same intent ID and Stripe idempotency key.
 */
export async function executePreparedSandboxUpgrade(args:{intentId:string;clerkUserId:string;verifiedEmail:string}){
 const deny=(reason:string)=>({ok:false as const,reason});
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027"||
  process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED!=="true"||
  stripeMode()!=="test"||
  !/^upg_[0-9a-f]{36}$/.test(args.intentId)||
  !/^user_[A-Za-z0-9_-]{8,128}$/.test(args.clerkUserId)||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.verifiedEmail)||
  args.verifiedEmail!==args.verifiedEmail.trim().toLowerCase())return deny("disabled_or_invalid");
 if(!await verifiedSandboxStripeAccount())return deny("stripe_account_unverified");
 const url=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 const key=sharedUsageMemberKey(args.verifiedEmail,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!url||!key)return deny("isolated_db_unavailable");
 const sql=neon(url);
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(String(branch[0]?.id||"")!=="br-young-salad-aubnf7xt")return deny("wrong_branch");
 const binding=await sql`SELECT clerk_user_id,stripe_customer_id,stripe_subscription_id,access_active
 FROM public.fitness_memberships WHERE email=${args.verifiedEmail} LIMIT 2`;
 if(binding.length!==1||binding[0].access_active!==true||
  String(binding[0].clerk_user_id)!==args.clerkUserId)return deny("member_unverified");
 const intents=await sql`SELECT * FROM public.ai_upgrade_intents
 WHERE id=${args.intentId} AND member_key=${key} LIMIT 2`;
 if(intents.length!==1)return deny("intent_unverified");
 const intent=intents[0],subId=String(intent.stripe_subscription_id),
 custId=String(intent.stripe_customer_id);
 if(custId!==String(binding[0].stripe_customer_id)||
  subId!==String(binding[0].stripe_subscription_id)||
  !["prepared","awaiting_payment"].includes(String(intent.state)))return deny("intent_state_invalid");
 const [customer,sub]=await Promise.all([
  stripeRequest("/customers/"+encodeURIComponent(custId)),
  stripeRequest("/subscriptions/"+encodeURIComponent(subId))]);
 if(customer.deleted===true||String(customer.email||"").toLowerCase()!==args.verifiedEmail||
  sub.customer!==custId||sub.status!=="active"||sub.cancel_at_period_end===true)return deny("billing_unverified");
 if(intent.invoice_id){
  // A stored invoice is not proof of payment. The signed webhook or an
  // independently fetched invoice must settle the allowance.
  const invoice=await stripeRequest("/invoices/"+encodeURIComponent(String(intent.invoice_id)));
  if(invoice.status==="paid"){
   const result=await processSandboxPaidUpgradeWebhook({
    eventType:"invoice.paid",invoiceId:String(intent.invoice_id)});
   if(result!=="applied"&&result!=="already_applied")
    return deny("paid_invoice_reconciliation_pending");
  }
  return {ok:true as const,status:invoice.status==="paid"?"paid":"pending_payment",
   invoiceId:String(intent.invoice_id)};
 }
 const items=sub.items&&typeof sub.items==="object"?sub.items as Record<string,unknown>:{};
 const data=Array.isArray(items.data)?items.data:[];
 const item=data[0] as Record<string,unknown>|undefined;
 const currentPrice=String((item?.price as Record<string,unknown>|undefined)?.id||"");
 // A retry is allowed if Stripe already changed the item to the target.
 // Otherwise, it must remain at the original verified price.
 if(data.length!==1||items.has_more===true||String(item?.id)!==String(intent.stripe_item_id)||
  (currentPrice!==String(intent.old_price_id)&&currentPrice!==String(intent.target_price_id)))
  return deny("subscription_changed");
 const request=buildSandboxStripeUpgradeChange({
  subscriptionId:subId,itemId:String(intent.stripe_item_id),
  targetPriceId:String(intent.target_price_id),intentId:args.intentId
 },{vercelEnv:process.env.VERCEL_ENV,branch:process.env.VERCEL_GIT_COMMIT_REF,
  mode:stripeMode(),enabled:process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED});
 if(!request.ok)return deny(request.reason);
 // Lock the durable intent before contacting Stripe; webhook will retry if
 // it arrives before the invoice identifier is bound.
 if(intent.state==="prepared"){
  const claimed=await sql`UPDATE public.ai_upgrade_intents
   SET state='awaiting_payment',updated_at=now() WHERE id=${args.intentId}
   AND state='prepared' RETURNING id`;
  if(claimed.length!==1)return deny("concurrent_upgrade");
 }
 if(currentPrice===String(intent.old_price_id)){
  await stripeRequest(request.path,{method:"POST",body:request.body,
   idempotencyKey:request.idempotencyKey});
 }
 const latest=await stripeRequest("/subscriptions/"+encodeURIComponent(subId));
 const latestId=typeof latest.latest_invoice==="string"?latest.latest_invoice:
  latest.latest_invoice&&typeof latest.latest_invoice==="object"?
  String((latest.latest_invoice as Record<string,unknown>).id||""):"";
 if(!/^in_[A-Za-z0-9]+$/.test(latestId))return deny("invoice_not_available");
 const invoice=await stripeRequest("/invoices/"+encodeURIComponent(latestId));
 const parent=invoice.parent&&typeof invoice.parent==="object"?invoice.parent as Record<string,unknown>:{};
 const details=parent.subscription_details&&typeof parent.subscription_details==="object"?parent.subscription_details as Record<string,unknown>:{};
 if(invoice.customer!==custId||
  String(invoice.subscription||details.subscription||"")!==subId||
  invoice.billing_reason!=="subscription_update")return deny("invoice_not_bound");
 const bound=await sql`UPDATE public.ai_upgrade_intents
 SET invoice_id=${latestId},updated_at=now()
 WHERE id=${args.intentId} AND state='awaiting_payment'
 AND (invoice_id IS NULL OR invoice_id=${latestId})
 RETURNING id`;
 if(bound.length!==1)return deny("invoice_binding_conflict");
 // The event may have arrived before binding. Reconcile it once immediately,
 // without assuming paid status. All payment evidence is independently fetched.
 if(invoice.status==="paid"){
  const result=await processSandboxPaidUpgradeWebhook({eventType:"invoice.paid",invoiceId:latestId});
  if(result!=="applied"&&result!=="already_applied")return deny("paid_invoice_reconciliation_pending");
 }
 return {ok:true as const,status:invoice.status==="paid"?"paid":"pending_payment",invoiceId:latestId};
}
