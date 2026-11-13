/**
 * Isolated PR #251 paid-continuation evidence. Reads only the dedicated Neon
 * test branch and TEST Stripe resources. Never trusts client billing claims.
 */
import {currentUser} from "@clerk/nextjs/server";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {assertIsolatedTrialTestCheckout} from "@/lib/isolatedTrialCheckoutSafety";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {stripeRequest} from "@/lib/stripeServer";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {stripeUsageWindowFromVerifiedRecord} from "@/lib/stripeUsagePeriod";

const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const sid=(v:unknown)=>typeof v==="string"?v:String(record(v).id||"");
export const TEST_ENTITLEMENT="tier_growth_v1";
export const TEST_MONTHLY_ALLOWANCE=200;
type Refused={ready:false;reason:string};
type Approved={ready:true;clerkId:string;memberKey:string;periodStart:string;periodEnd:string;remaining:number};
export type PaidEvidence=Refused|Approved;
const deny=(reason:string):Refused=>({ready:false,reason});

export async function verifiedIsolatedPaidContinuation():Promise<PaidEvidence>{
 if(!isolatedTrialPreviewEnabled())return deny("preview_disabled");
 try{
  const user=await currentUser();
  const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
  if(!user||user.id!==process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||
     !primary||primary.verification?.status!=="verified")return deny("dedicated_test_login_required");
  const email=primary.emailAddress.trim().toLowerCase();
  await assertIsolatedTrialTestCheckout();
  const sql=await introHistorySql();
  const expectedKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
  if(!expectedKey)return deny("member_identity_invalid");
  const [grant,membership]=await Promise.all([
   sql`SELECT member_key,converted_at FROM public.introductory_trial_grants
     WHERE clerk_user_id=${user.id} LIMIT 2`,
   sql`SELECT stripe_customer_id,stripe_subscription_id,access_active,stripe_status
     FROM public.fitness_memberships WHERE clerk_user_id=${user.id} AND email=${email} LIMIT 2`
  ]);
  if(grant.length!==1||grant[0].converted_at==null||
     String(grant[0].member_key)!==expectedKey||
     membership.length!==1||membership[0].access_active!==true||
     membership[0].stripe_status!=="active")return deny("converted_membership_not_verified");
  const customerId=String(membership[0].stripe_customer_id||"");
  const subscriptionId=String(membership[0].stripe_subscription_id||"");
  if(!/^cus_[A-Za-z0-9]+$/.test(customerId)||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
   return deny("billing_link_missing");
  const [sub,customer]=await Promise.all([
   stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId)),
   stripeRequest("/customers/"+encodeURIComponent(customerId))
  ]);
  const metadata=record(sub.metadata);
  const items=record(sub.items);
  const list=Array.isArray(items.data)?items.data:[];
  const price=record(record(list[0]).price);
  const recurring=record(price.recurring);
  if(sub.id!==subscriptionId||sub.customer!==customerId||sub.livemode!==false||
     sub.status!=="active"||metadata.intro_trial_preview!=="true"||
     metadata.clerk_user_id!==user.id||customer.id!==customerId||
     customer.livemode!==false||customer.deleted===true||
     String(customer.email||"").trim().toLowerCase()!==email||
     list.length!==1||items.has_more===true||
     price.livemode!==false||Number(price.unit_amount)!==1500||
     price.currency!=="usd"||recurring.interval!=="month"||
     Number(recurring.interval_count||1)!==1||recurring.usage_type!=="licensed")
   return deny("stripe_test_subscription_not_verified");
  const priceId=String(price.id||"");
  const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId,subscriptionId,priceId});
  if(!window.ok||Date.now()<new Date(window.periodStart).getTime()||
     Date.now()>=new Date(window.periodEnd).getTime())return deny("billing_period_invalid");
  const invoiceId=sid(sub.latest_invoice);
  if(!/^in_[A-Za-z0-9]+$/.test(invoiceId))return deny("paid_invoice_missing");
  const invoice=await stripeRequest("/invoices/"+encodeURIComponent(invoiceId));
  const parent=record(record(invoice.parent).subscription_details);
  const invoiceSub=sid(invoice.subscription||parent.subscription);
  const paidAt=Number(record(invoice.status_transitions).paid_at);
  if(invoice.livemode!==false||invoice.status!=="paid"||
     Number(invoice.amount_remaining)!==0||Number(invoice.amount_paid)<=0||
     !Number.isSafeInteger(paidAt)||paidAt<=0||
     invoice.currency!=="usd"||sid(invoice.customer)!==customerId||
     invoiceSub!==subscriptionId)return deny("paid_invoice_not_verified");
  const existing=await sql`SELECT entitlement_key,period_start,period_end,limit_uses,
    completed_uses,reserved_uses FROM public.shared_ai_usage_periods
    WHERE member_key=${expectedKey} AND period_start<${window.periodEnd}::timestamptz
      AND period_end>${window.periodStart}::timestamptz LIMIT 2`;
  if(existing.length>1)return deny("conflicting_paid_wallet");
  let remaining=TEST_MONTHLY_ALLOWANCE;
  if(existing.length===1){
   const w=existing[0];
   const completed=Number(w.completed_uses),reserved=Number(w.reserved_uses);
   if(w.entitlement_key!==TEST_ENTITLEMENT||
      new Date(String(w.period_start)).toISOString()!==window.periodStart||
      new Date(String(w.period_end)).toISOString()!==window.periodEnd||
      Number(w.limit_uses)!==TEST_MONTHLY_ALLOWANCE||
      !Number.isInteger(completed)||completed<0||!Number.isInteger(reserved)||
      reserved<0||completed+reserved>TEST_MONTHLY_ALLOWANCE)
    return deny("conflicting_paid_wallet");
   remaining=TEST_MONTHLY_ALLOWANCE-completed-reserved;
  }
  return {ready:true,clerkId:user.id,memberKey:expectedKey,
   periodStart:window.periodStart,periodEnd:window.periodEnd,remaining};
 }catch{return deny("paid_verification_unavailable");}
}
