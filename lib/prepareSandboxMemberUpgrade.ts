import {neon} from "@neondatabase/serverless";
import {stripeMode,stripeRequest} from "./stripeServer";
import {sandboxTierCatalogFor} from "./sandboxTierManifest";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {decideInPlaceUpgrade,type UpgradeTier} from "./inPlaceUpgradePolicy";
import {randomBytes} from "node:crypto";
import {verifiedSandboxStripeAccount} from "./sandboxStripeAccountGuard";

// All database/Stripe operations stay in one explicitly isolated preview.
// Never fall back to production membershipDb or an inherited DB URL.
export async function prepareSandboxMemberUpgrade(args:{
 clerkUserId:string;verifiedEmail:string;targetTier:string
}):Promise<{ok:true;intentId:string;currentTier:string;targetTier:string;previewRequired:true}|{ok:false;reason:string}>{
 const deny=(reason:string)=>({ok:false as const,reason});
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED!=="true"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027"||
  stripeMode()!=="test")return deny("disabled");
 if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(args.clerkUserId)||
 !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.verifiedEmail)||
 args.verifiedEmail!==args.verifiedEmail.trim().toLowerCase()||
 !["starter","growth","premium","elite"].includes(args.targetTier))return deny("invalid_request");
 if(!await verifiedSandboxStripeAccount())return deny("wrong_stripe_account");
 const resolved=sandboxTierCatalogFor("preview","test");
 if(!resolved.ok)return deny("invalid_price_catalog");
 const url=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 if(!url)return deny("sandbox_db_missing");
 const sql=neon(url);
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(String(branch[0]?.id||"")!=="br-young-salad-aubnf7xt")return deny("wrong_db_branch");
 const records=await sql`SELECT clerk_user_id,stripe_customer_id,stripe_subscription_id,access_active
 FROM public.fitness_memberships WHERE email=${args.verifiedEmail} LIMIT 2`;
 if(records.length!==1 || records[0].access_active!==true||
 String(records[0].clerk_user_id)!==args.clerkUserId)return deny("unbound_member");
 const custId=String(records[0].stripe_customer_id||""),
 subId=String(records[0].stripe_subscription_id||"");
 if(!/^cus_[A-Za-z0-9]+$/.test(custId)||!/^sub_[A-Za-z0-9]+$/.test(subId))
 return deny("unbound_billing");
 const [customer,sub]=await Promise.all([
 stripeRequest("/customers/"+encodeURIComponent(custId)),
 stripeRequest("/subscriptions/"+encodeURIComponent(subId))]);
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==args.verifiedEmail||
 String(sub.customer)!==custId ||sub.status!=="active" ||sub.cancel_at_period_end===true ||
 sub.pending_update)return deny("billing_unverified");
 const items=sub.items&&typeof sub.items==="object"?sub.items as Record<string,unknown>:{};
 const data=Array.isArray(items.data)?items.data:[];
 if(items.has_more===true||data.length!==1)return deny("multiple_items");
 const item=data[0] as Record<string,unknown>,price=item.price as Record<string,unknown>;
 const currentPrice=String(price?.id||"");
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId:custId,subscriptionId:subId,priceId:currentPrice});
 if(!window.ok)return deny("period_unverified");
 const key=sharedUsageMemberKey(args.verifiedEmail,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!key)return deny("member_key_missing");
 const wallets=await sql`SELECT entitlement_key,limit_uses,completed_uses,reserved_uses,period_end
 FROM public.shared_ai_usage_periods WHERE member_key=${key}
 AND period_start=${window.periodStart}::timestamptz LIMIT 2`;
 if(wallets.length!==1||new Date(String(wallets[0].period_end)).toISOString()!==window.periodEnd)
 return deny("wallet_not_reconciled");
 const w=wallets[0];
 const decision=decideInPlaceUpgrade({
 clerkUserId:args.clerkUserId,membershipClerkUserId:String(records[0].clerk_user_id),
 stripeCustomerId:custId,subscriptionCustomerId:String(sub.customer),
 stripeSubscriptionId:subId,subscriptionId:String(sub.id),
 status:String(sub.status),billingPeriodStart:window.periodStart,
 billingPeriodEnd:window.periodEnd,currentPriceId:currentPrice,
 currentIncludedMessages:Number(w.limit_uses),
 completedMessages:Number(w.completed_uses),reservedMessages:Number(w.reserved_uses),
 priorLedgerReconciled:true
 },args.targetTier as UpgradeTier,resolved.catalog);
 if(!decision.ok)return deny(decision.reason);
 // Reuse one matching prepared intent; do not create a duplicate.
 const pending=await sql`SELECT id,member_key,entitlement_key,stripe_customer_id,
 stripe_item_id,old_price_id,target_price_id,expected_limit,target_limit,
 period_end,state,invoice_id FROM public.ai_upgrade_intents
 WHERE stripe_subscription_id=${subId} AND period_start=${window.periodStart}::timestamptz
 AND state IN ('prepared','awaiting_payment') LIMIT 2`;
 if(pending.length>1)return deny("multiple_pending_upgrades");
 if(pending.length===1){
  const prior=pending[0];
  if(prior.state!=="prepared"||prior.invoice_id)return deny("payment_requires_review");
  if(prior.member_key!==key||prior.entitlement_key!==String(w.entitlement_key)||
    prior.stripe_customer_id!==custId||prior.stripe_item_id!==String(item.id)||
    prior.old_price_id!==decision.current.stripePriceId||
    prior.target_price_id!==decision.target.stripePriceId||
    Number(prior.expected_limit)!==Number(w.limit_uses)||
    Number(prior.target_limit)!==decision.target.includedMessages||
    new Date(String(prior.period_end)).toISOString()!==window.periodEnd)
    return deny("different_upgrade_pending");
  return {ok:true,intentId:String(prior.id),currentTier:decision.current.tier,
    targetTier:decision.target.tier,previewRequired:true};
 }
 const id="upg_"+randomBytes(18).toString("hex");
 const inserted=await sql`INSERT INTO public.ai_upgrade_intents(
 id,member_key,entitlement_key,period_start,period_end,
 stripe_customer_id,stripe_subscription_id,stripe_item_id,
 old_price_id,target_price_id,expected_limit,target_limit,state)
 VALUES(${id},${key},${String(w.entitlement_key)},
 ${window.periodStart}::timestamptz,${window.periodEnd}::timestamptz,
 ${custId},${subId},${String(item.id)},
 ${decision.current.stripePriceId},${decision.target.stripePriceId},
 ${Number(w.limit_uses)},${decision.target.includedMessages},'prepared')
 ON CONFLICT DO NOTHING RETURNING id`;
 if(inserted.length!==1)return deny("upgrade_already_pending");
 return {ok:true,intentId:id,currentTier:decision.current.tier,
 targetTier:decision.target.tier,previewRequired:true};
}
