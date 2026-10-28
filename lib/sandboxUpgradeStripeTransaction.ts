import {neon} from "@neondatabase/serverless";
import {stripeMode,stripeRequest} from "./stripeServer";
import {sandboxTierCatalogFor} from "./sandboxTierManifest";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {processSandboxPaidUpgradeWebhook} from "./sandboxPaidUpgradeWebhook";
import {verifySandboxUpgradeQuote} from "./sandboxUpgradeQuote";

type Obj=Record<string,unknown>;
const o=(v:unknown):Obj|null=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:null;
type Denied={ok:false;reason:string};
const deny=(reason:string):Denied=>({ok:false,reason});
const id=(s:string,prefix:string)=>new RegExp("^"+prefix+"_[A-Za-z0-9]+$").test(s);
const CUTOFF=20000; // Safety bound: test upgrade prorations never exceed $200.

export async function sandboxUpgradeTransaction(args:{
 action:"quote"|"confirm";intentId:string;clerkUserId:string;verifiedEmail:string;
 expectedAmountCents?:number;
}):Promise<{ok:true;intentId:string;amountCents:number;currency:"usd";invoiceId?:string;status:"quoted"|"awaiting_payment"|"paid_pending_reconciliation"|"applied"}|Denied>{
 if(process.env.VERCEL_ENV!=="preview"||
 process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027"||
 process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED!=="true"||
 stripeMode()!=="test")return deny("disabled");
 if(!/^upg_[0-9a-f]{36}$/.test(args.intentId)||
 !/^user_[A-Za-z0-9_-]{8,128}$/.test(args.clerkUserId)||
 args.verifiedEmail!==args.verifiedEmail.trim().toLowerCase())return deny("invalid_identity");
 const url=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 const key=sharedUsageMemberKey(args.verifiedEmail,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!url||!key)return deny("isolation_missing");
 const sql=neon(url);
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(branch.length!==1||String(branch[0].id)!=="br-young-salad-aubnf7xt")return deny("wrong_branch");
 const members=await sql`SELECT clerk_user_id,stripe_customer_id,stripe_subscription_id,access_active
 FROM public.fitness_memberships WHERE email=${args.verifiedEmail} LIMIT 2`;
 if(members.length!==1||members[0].access_active!==true||
 members[0].clerk_user_id!==args.clerkUserId)return deny("membership_not_verified");
 const intents=await sql`SELECT id,member_key,entitlement_key,period_start,period_end,
 stripe_customer_id,stripe_subscription_id,stripe_item_id,old_price_id,target_price_id,
 expected_limit,target_limit,invoice_id,state FROM public.ai_upgrade_intents
 WHERE id=${args.intentId} AND member_key=${key} LIMIT 2`;
 if(intents.length!==1)return deny("intent_missing");
 const i=intents[0];
 if(i.stripe_customer_id!==members[0].stripe_customer_id||
 i.stripe_subscription_id!==members[0].stripe_subscription_id||
 i.state!=="prepared"||i.invoice_id)return deny("intent_not_prepared");
 const catalog=sandboxTierCatalogFor("preview","test");
 if(!catalog.ok)return deny("no_catalog");
 const prior=catalog.catalog.find(x=>x.stripePriceId===i.old_price_id),
 next=catalog.catalog.find(x=>x.stripePriceId===i.target_price_id);
 if(!prior||!next||next.monthlyUsdCents<=prior.monthlyUsdCents||
 next.includedMessages<=prior.includedMessages||
 Number(i.expected_limit)!==prior.includedMessages||
 Number(i.target_limit)!==next.includedMessages)return deny("tier_mismatch");
 const wallets=await sql`SELECT period_end,limit_uses,completed_uses,reserved_uses
 FROM public.shared_ai_usage_periods WHERE member_key=${key}
 AND entitlement_key=${String(i.entitlement_key)} AND period_start=${i.period_start}::timestamptz LIMIT 2`;
 if(wallets.length!==1||
 Number(wallets[0].limit_uses)!==Number(i.expected_limit)||
 Number(wallets[0].completed_uses)+Number(wallets[0].reserved_uses)>Number(wallets[0].limit_uses)||
 new Date(String(wallets[0].period_end)).toISOString()!==new Date(String(i.period_end)).toISOString())return deny("wallet_changed");
 const customerId=String(i.stripe_customer_id),subId=String(i.stripe_subscription_id),itemId=String(i.stripe_item_id);
 if(!id(customerId,"cus")||!id(subId,"sub")||!id(itemId,"si"))return deny("stripe_id_invalid");
 const [customer,sub]=await Promise.all([stripeRequest("/customers/"+customerId),stripeRequest("/subscriptions/"+subId)]);
 const rows=o(sub.items)?.data,items=Array.isArray(rows)?rows:[];
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==args.verifiedEmail||
 sub.customer!==customerId||sub.status!=="active"||sub.pending_update||
 sub.cancel_at_period_end===true||items.length!==1||o(sub.items)?.has_more===true||
 o(items[0])?.id!==itemId||o(o(items[0])?.price)?.id!==i.old_price_id)return deny("stripe_membership_changed");
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId,subscriptionId:subId,priceId:String(i.old_price_id)});
 if(!window.ok||window.periodStart!==new Date(String(i.period_start)).toISOString()||
 window.periodEnd!==new Date(String(i.period_end)).toISOString())return deny("period_changed");
 // Keep the quote timestamp stable for this request, and use the same value
 // for Stripe's update. This endpoint refuses zero or unexpected totals.
 const stamp=Math.floor(Date.now()/1000);
 const previewBody=new URLSearchParams();
 previewBody.set("customer",customerId);
 previewBody.set("subscription",subId);
 previewBody.set("subscription_details[items][0][id]",itemId);
 previewBody.set("subscription_details[items][0][price]",next.stripePriceId);
 previewBody.set("subscription_details[proration_date]",String(stamp));
 previewBody.set("subscription_details[proration_behavior]","always_invoice");
 const quote=await stripeRequest("/invoices/create_preview",{method:"POST",body:previewBody});
 const checked=verifySandboxUpgradeQuote({preview:quote,customerId,
 subscriptionId:subId,subscriptionItemId:itemId,
 oldPriceId:String(i.old_price_id),newPriceId:next.stripePriceId,
 periodEnd:window.periodEnd});
 if(!checked.ok)return deny(checked.reason);
 const amount=checked.amountCents;
 if(args.action==="quote")return {ok:true,intentId:args.intentId,amountCents:amount,currency:"usd",status:"quoted"};
 if(args.expectedAmountCents!==amount)return deny("quote_changed_reconfirm");
 // No second attempt on a pending/ambiguous operation. The subscription update
 // uses a stable idempotency key derived from the durable intent.
 const claimed=await sql`UPDATE public.ai_upgrade_intents SET state='awaiting_payment',updated_at=now()
 WHERE id=${args.intentId} AND state='prepared' AND invoice_id IS NULL RETURNING id`;
 if(claimed.length!==1)return deny("already_claimed");
 const body=new URLSearchParams();
 body.set("items[0][id]",itemId);body.set("items[0][price]",next.stripePriceId);
 body.set("proration_behavior","always_invoice");
 body.set("proration_date",String(stamp));
 body.set("payment_behavior","pending_if_incomplete");
 body.set("billing_cycle_anchor","unchanged");
 // Do not send a new Stripe mutation on retry after an uncertain outcome.
 const updated=await stripeRequest("/subscriptions/"+subId,{
 method:"POST",body,idempotencyKey:"aicoachdir-upgrade-"+args.intentId});
 const inv=typeof updated.latest_invoice==="string"?updated.latest_invoice:
 String(o(updated.latest_invoice)?.id||"");
 if(!id(inv,"in"))return deny("invoice_not_returned_operator_review");
 const persisted=await sql`UPDATE public.ai_upgrade_intents
 SET invoice_id=${inv},updated_at=now()
 WHERE id=${args.intentId} AND state='awaiting_payment' AND invoice_id IS NULL RETURNING id`;
 if(persisted.length!==1)return deny("invoice_binding_requires_review");
 // Stripe might have paid the invoice before the webhook could find its
 // durable mapping; reconcile once after recording it as well.
 const invoice=await stripeRequest("/invoices/"+inv);
 if(invoice.status==="paid"){
  try{
   const outcome=await processSandboxPaidUpgradeWebhook({eventType:"invoice.paid",invoiceId:inv});
   return {ok:true,intentId:args.intentId,amountCents:amount,currency:"usd",invoiceId:inv,
    status:outcome==="applied"||outcome==="already_applied"?"applied":"paid_pending_reconciliation"};
  }catch{return {ok:true,intentId:args.intentId,amountCents:amount,currency:"usd",invoiceId:inv,status:"paid_pending_reconciliation"}}
 }
 return {ok:true,intentId:args.intentId,amountCents:amount,currency:"usd",invoiceId:inv,status:"awaiting_payment"};
}
