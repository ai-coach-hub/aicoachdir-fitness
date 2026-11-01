import {membershipDb,getFitnessMembershipBySubscriptionId} from "@/lib/fitnessMembershipDb";
import {stripeRequest} from "@/lib/stripeServer";
import {approvedLiveTierCatalog,publicTiers} from "@/lib/newTierCatalog";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {stripeUsageWindowFromVerifiedRecord} from "@/lib/stripeUsagePeriod";

/**
 * Settle a newly purchased tier or its paid monthly renewal. Only signed
 * invoice.paid webhook callers may invoke this. No signup request may mint
 * an allowance and no existing grandfathered period is altered.
 */
type Obj=Record<string,unknown>;
const obj=(x:unknown):Obj=>x&&typeof x==="object"&&!Array.isArray(x)?x as Obj:{};
const id=(x:unknown)=>typeof x==="string"?x:String(obj(x).id||"");
const iso=(x:unknown)=>new Date(Number(x)*1000).toISOString();
export async function settleNewTierPaidInvoice(invoiceId:string,signedWebhook:boolean):Promise<"ignored"|"created"|"already_created">{
  if(!signedWebhook||process.env.VERCEL_ENV!=="production"||
     process.env.PRODUCTION_UPGRADE_WEBHOOK_ENABLED!=="true"||
     !/^in_[A-Za-z0-9]+$/.test(invoiceId))return "ignored";
  const invoice=await stripeRequest("/invoices/"+encodeURIComponent(invoiceId));
  const paidAt=obj(invoice.status_transitions).paid_at;
  if(invoice.object!=="invoice"||invoice.livemode!==true||
     invoice.status!=="paid"||invoice.amount_remaining!==0||
     !Number.isSafeInteger(paidAt)||Number(paidAt)<=0||
     !["subscription_create","subscription_cycle"].includes(String(invoice.billing_reason)))return "ignored";
  const subId=id(invoice.subscription||obj(obj(invoice.parent).subscription_details).subscription);
  if(!/^sub_[A-Za-z0-9]+$/.test(subId))return "ignored";
  const sub=await stripeRequest("/subscriptions/"+encodeURIComponent(subId));
  const items=obj(sub.items),itemList=Array.isArray(items.data)?items.data:[];
  if(itemList.length!==1||items.has_more)return "ignored";
  const priceId=id(obj(itemList[0]).price);
  const cat=approvedLiveTierCatalog();
  const tier=publicTiers.find(t=>cat[t.tier]===priceId);
  if(!tier)return "ignored"; // Never reconcile grandfathered or unrelated invoices.
  if(invoice.currency!=="usd"||Number(invoice.amount_paid)<=0||
     id(invoice.customer)!==id(sub.customer)||sub.livemode!==true||
     sub.status!=="active")throw Error("Tier payment not confirmed");
  const window=stripeUsageWindowFromVerifiedRecord(sub,{
    customerId:id(sub.customer),subscriptionId:subId,priceId,
  });
  if(!window.ok)throw Error("Paid tier period unavailable");
  const lines=await stripeRequest("/invoices/"+encodeURIComponent(invoiceId)+"/lines?limit=100");
  const matched=(Array.isArray(lines.data)?lines.data:[]).filter((line:unknown)=>{
    const l=obj(line),details=obj(obj(l.parent).subscription_item_details);
    const lp=id(l.price||obj(obj(l.pricing).price_details).price);
    return lp===priceId&&details.proration!==true&&l.proration!==true&&
      (id(details.subscription||l.subscription)||subId)===subId&&
      iso(obj(l.period).start)===window.periodStart&&
      iso(obj(l.period).end)===window.periodEnd;
  });
  if(lines.has_more||matched.length!==1)throw Error("Paid tier invoice line mismatch");
  const member=await getFitnessMembershipBySubscriptionId(subId);
  if(!member)throw Error("Paid tier subscription membership binding pending");
  if(member.access_active!==true||id(member.stripe_customer_id)!==id(sub.customer)||
      !/^user_[A-Za-z0-9_-]{8,128}$/.test(String(member.clerk_user_id||"")))
    throw Error("Paid tier member not verified");
  const customer=await stripeRequest("/customers/"+encodeURIComponent(id(sub.customer)));
  const email=String(member.email||"").trim().toLowerCase();
  if(customer.deleted||String(customer.email||"").trim().toLowerCase()!==email)
    throw Error("Paid tier customer identity mismatch");
  const memberKey=sharedUsageMemberKey(email,process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"");
  if(!memberKey)throw Error("Paid tier member key unavailable");
  const sql=membershipDb();
  const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
  if(branch[0]?.id!=="br-sparkling-glitter-aucpz59d")
    throw Error("Production wallet branch mismatch");
  const entitlement="tier_"+tier.tier+"_v1";
  await sql`INSERT INTO public.shared_ai_usage_periods(
    member_key,entitlement_key,period_start,period_end,limit_uses,completed_uses,reserved_uses)
    VALUES(${memberKey},${entitlement},${window.periodStart}::timestamptz,
      ${window.periodEnd}::timestamptz,${tier.messages},0,0)
    ON CONFLICT DO NOTHING`;
  const rows=await sql`SELECT * FROM public.shared_ai_usage_periods
    WHERE member_key=${memberKey} AND period_start=${window.periodStart}::timestamptz LIMIT 2`;
  if(rows.length!==1||rows[0].entitlement_key!==entitlement||
    Number(rows[0].limit_uses)!==tier.messages||
    new Date(String(rows[0].period_end)).toISOString()!==window.periodEnd)
    throw Error("Paid tier wallet conflict");
  return Number(rows[0].completed_uses)===0&&Number(rows[0].reserved_uses)===0?"created":"already_created";
}
