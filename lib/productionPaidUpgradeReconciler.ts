import {membershipDb} from "./fitnessMembershipDb";
import {stripeRequest,stripeMode} from "./stripeServer";
import {verifyPaidUpgradeInvoice} from "./productionPaidInvoiceGuard";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
type R=Record<string,unknown>;
const obj=(v:unknown):R=>v&&typeof v==="object"&&!Array.isArray(v)?v as R:{};
const string=(v:unknown)=>typeof v==="string"?v:"";
const asIso=(v:unknown)=>new Date(String(v)).toISOString();

/** Apply only an authenticated invoice.paid event previously bound to a
 * durable customer-initiated intent. Never infer identity from webhook metadata.
 * A separate operational feature switch is required even after deployment.
 */
export async function reconcileProductionPaidUpgrade(args:{eventType:string;invoiceId:string;signedWebhook:boolean}):
 Promise<"ignored"|"applied"|"already_applied">{
 if(process.env.VERCEL_ENV!=="production"||
    process.env.PUBLIC_TIER_UPGRADES_ENABLED!=="true"||
    process.env.PRODUCTION_UPGRADE_WEBHOOK_ENABLED!=="true"||
    stripeMode()!=="live"||!args.signedWebhook||
    args.eventType!=="invoice.paid"||
    !/^in_[A-Za-z0-9]+$/.test(args.invoiceId))return "ignored";
 const sql=membershipDb();
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(branch.length!==1||branch[0].id!=="br-sparkling-glitter-aucpz59d")
   throw Error("Production DB branch mismatch");
 const intents=await sql`SELECT * FROM public.ai_tier_change_intents
 WHERE invoice_id=${args.invoiceId} LIMIT 2`;
 if(intents.length===0)return "ignored";
 if(intents.length!==1)throw Error("Ambiguous intent");
 const i=intents[0];
 if(i.state==="applied")return "already_applied";
 if(i.state!=="awaiting_payment")return "ignored";
 const [invoice,sub]=await Promise.all([
   stripeRequest("/invoices/"+encodeURIComponent(args.invoiceId)),
   stripeRequest("/subscriptions/"+encodeURIComponent(String(i.stripe_subscription_id)))
 ]);
 const items=obj(sub.items);
 const data=Array.isArray(items.data)?items.data:[];
 if(data.length!==1||items.has_more===true)throw Error("Ambiguous Stripe items");
 const currentPrice=string(obj(obj(data[0]).price).id);
 const parent=obj(invoice.parent);
 const details=obj(parent.subscription_details);
 const invoiceSubscription=string(invoice.subscription||details.subscription);
 const wallets=await sql`SELECT period_start,period_end,limit_uses,completed_uses,reserved_uses
 FROM public.shared_ai_usage_periods WHERE member_key=${String(i.member_key)}
 AND entitlement_key=${String(i.entitlement_key)}
 AND period_start=${asIso(i.period_start)}::timestamptz LIMIT 2`;
 if(wallets.length!==1)throw Error("Wallet unavailable");
 const w=wallets[0];
 const window=stripeUsageWindowFromVerifiedRecord(sub,{
 customerId:String(i.stripe_customer_id),
 subscriptionId:String(i.stripe_subscription_id),
 priceId:String(i.target_price_id)});
 if(!window.ok)throw Error("Stripe billing period mismatch");
 const matchesWindow=window.periodStart===asIso(i.period_start)&&
  window.periodEnd===asIso(i.period_end)&&
  asIso(w.period_start)===asIso(i.period_start)&&
  asIso(w.period_end)===asIso(i.period_end);
 const expected=Number(i.expected_limit),target=Number(i.target_limit);
 const matchesWallet=Number(w.limit_uses)===expected&&expected>0&&
 Number.isSafeInteger(Number(w.completed_uses))&&Number.isSafeInteger(Number(w.reserved_uses))&&
 Number(w.completed_uses)>=0&&Number(w.reserved_uses)>=0&&
 Number(w.completed_uses)+Number(w.reserved_uses)<=expected;
 const proof=verifyPaidUpgradeInvoice({
 signedWebhook:args.signedWebhook,liveMode:invoice.livemode===true&&sub.livemode===true,
 eventType:args.eventType,invoiceId:args.invoiceId,
 invoiceStatus:string(invoice.status),invoicePaid:invoice.paid===true,
 invoiceSubscriptionId:invoiceSubscription,
 invoiceCustomerId:string(invoice.customer),
 intentInvoiceId:string(i.invoice_id),
 intentSubscriptionId:string(i.stripe_subscription_id),
 intentCustomerId:string(i.stripe_customer_id),
 intentState:string(i.state),
 originalPriceId:string(i.old_price_id),
 expectedPriceId:string(i.target_price_id),
 observedStripePriceId:currentPrice,
 walletPeriodMatches:matchesWindow,walletLimitMatches:matchesWallet
 });
 if(!proof.ok)throw Error("Paid-upgrade proof rejected: "+proof.reason);
 if(invoice.billing_reason!=="subscription_update"||sub.status!=="active"||
    sub.customer!==i.stripe_customer_id||target<=expected)throw Error("Subscription not settled");
 // No extra emails, IDs, or provider credentials are written to logs.
 const rows=await sql`SELECT public.ai_tier_apply_verified_paid_upgrade(
 ${String(i.id)},${args.invoiceId},${expected},${target}) AS status`;
 const status=String(rows[0]?.status||"");
 if(status==="already_applied")return "already_applied";
 if(status==="applied")return "applied";
 throw Error("Atomic wallet transition rejected: "+status);
}
