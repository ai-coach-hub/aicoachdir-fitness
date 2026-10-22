import {membershipDb,getFitnessMembership,memberHasFitnessAccess} from "./fitnessMembershipDb";
import {stripeRequest} from "./stripeServer";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {approvedSharedPriceIds} from "./sharedUsagePriceApproval";

// Production activation requires separate, explicit deployment configuration.
// Off by default. Preview is pinned to the private Life Coach branch/database.
export function sharedUsageGateEnabled(){
 if(process.env.SHARED_USAGE_GATE_ENABLED!=="true")return false;
 if(process.env.VERCEL_ENV==="preview")
  return process.env.VERCEL_GIT_COMMIT_REF==="feature/life-coach-agent-sandbox-20261011";
 const cutover=String(process.env.SHARED_USAGE_CUTOVER_AT||"");
 const stamp=Date.parse(cutover);
 const validCutover=Number.isFinite(stamp) && new Date(stamp).toISOString()===cutover;
 return process.env.VERCEL_ENV==="production" &&
        process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true" &&
        process.env.SHARED_USAGE_OPENING_BALANCES_RECONCILED==="true" &&
        validCutover;
}
export type QuotaCoach="fitness"|"budgeting"|"life";
export type QuotaPermit={
 memberKey:string;entitlementKey:string;periodStart:string;periodEnd:string;
 limitUses:number;
};
export type QuotaResult={status:string;permit?:QuotaPermit};

const root=()=>String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
async function approvedPrices():Promise<string[]>{
 const extraApprovedPrices=String(process.env.SHARED_USAGE_APPROVED_PRICE_IDS||"");
 if(process.env.VERCEL_ENV==="production"){
  // The site's verified $15 subscription price already lives in the billing
  // database. Read it without creating new Stripe prices or migrating members.
  const sql=await checkedDb();
  const rows=await sql`SELECT config_value FROM public.billing_config
    WHERE config_key=${"stripe_fitness_price_id:live"} LIMIT 1`;
  return approvedSharedPriceIds({environment:"production",
    billingCurrentPrice:rows[0]?.config_value,extraApprovedPrices});
 }
 return approvedSharedPriceIds({environment:process.env.VERCEL_ENV||"",
   billingCurrentPrice:null,extraApprovedPrices});
}
const iso=(v:unknown)=>{
 const d=new Date(String(v));if(!Number.isFinite(d.getTime()))throw Error("Invalid billing date");
 return d.toISOString();
};
async function checkedDb(){
 if(!sharedUsageGateEnabled())throw Error("Shared AI usage is not enabled");
 const sql=membershipDb();
 if(process.env.VERCEL_ENV==="preview"||process.env.VERCEL_ENV==="production"){
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
  const actual=String(rows[0]?.branch_id||"");
  if(process.env.VERCEL_ENV==="preview"&&actual!=="br-autumn-breeze-auw38rgr")
   throw Error("Shared quota preview database branch mismatch");
  if(process.env.VERCEL_ENV==="production"&&actual!=="br-sparkling-glitter-aucpz59d")
   throw Error("Shared wallet production database branch mismatch");
 }
 return sql;
}
// Billing and account facts only come from the trusted membership database and
// independently verified Stripe records, NEVER a browser or Budgeting claim.
export async function resolveCurrentSharedUsage(email:string):Promise<QuotaPermit|null>{
 if(!sharedUsageGateEnabled())return null;
 const normalized=email.trim().toLowerCase(), secret=root();
 const memberKey=sharedUsageMemberKey(normalized,secret);
 if(!memberKey || normalized!==email)return null;
 // Internal synthetic/QA accounts remain available for private testing but
 // must never receive customer AI credits in production. Exact operator-
 // configured matches only; not inferred from "+" aliases or domain names.
 if(process.env.VERCEL_ENV==="production"){
  const qaOnly=String(process.env.SHARED_USAGE_NONBILLABLE_TEST_EMAILS||"")
   .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(qaOnly.includes(normalized))return null;
 }
 let record=await getFitnessMembership(normalized);
 if(!record || record.access_active!==true)return null;
 // Previously approved grandfathered members can have no Stripe IDs. Reuse
 // the existing verified-member reconciliation process before granting a
 // shared allowance; a stale timestamp alone must not lock out old members.
 // Neither the preview sandbox nor a disabled legacy-period mode can trigger
 // this live legacy reconciliation.
 const legacyNoBilling=record.stripe_status==="legacy_pickaxe_member" &&
   !record.stripe_customer_id&&!record.stripe_subscription_id;
 if(legacyNoBilling){
  const clerkId=String(record.clerk_user_id||"");
  if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(clerkId))return null;
  const last=Date.parse(String(record.last_legacy_verified_at||""));
  if(!Number.isFinite(last)||Date.now()-last>24*60*60_000){
   if(process.env.VERCEL_ENV!=="production"||
      process.env.SHARED_USAGE_LEGACY_PERIOD_MODE!=="utc_calendar")
     return null;
   // Existing service performs historical billing checks, rebinds verified
   // subscriptions when found, and stamps only successful legacy reviews.
   const current=await memberHasFitnessAccess(normalized,clerkId,
    {fallbackToPickaxeList:false});
   if(!current)return null;
   record=await getFitnessMembership(normalized);
   if(!record||record.access_active!==true)return null;
  }
 }
 const customerId=String(record.stripe_customer_id||"");
 const subscriptionId=String(record.stripe_subscription_id||"");
 let periodStart:string,periodEnd:string;
 if(customerId && subscriptionId){
  if(!/^cus_[A-Za-z0-9]+$/.test(customerId) ||
     !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))return null;
  const customer=await stripeRequest("/customers/"+encodeURIComponent(customerId));
  if(customer.deleted===true ||
     String(customer.email||"").trim().toLowerCase()!==normalized)return null;
  const sub=await stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId));
  if(sub.id!==subscriptionId || sub.customer!==customerId ||
     !["active","trialing"].includes(String(sub.status||"")))return null;
  // Explicit current and grandfathered price IDs only: no product creation.
  const prices=await approvedPrices();
  if(!prices.length)return null;
  const windows=prices.map(priceId=>stripeUsageWindowFromVerifiedRecord(sub,{
   customerId,subscriptionId,priceId
  })).filter((x):x is Extract<typeof x,{ok:true}>=>x.ok);
  if(windows.length!==1)return null;
  periodStart=windows[0].periodStart;
  periodEnd=windows[0].periodEnd;
 }else if(!customerId && !subscriptionId &&
          record.stripe_status==="legacy_pickaxe_member" &&
          process.env.SHARED_USAGE_LEGACY_PERIOD_MODE==="utc_calendar"){
  // Explicit operator-approved fallback for previously verified legacy
  // accounts without a known Stripe period, not an inferred Stripe cycle.
  const verified=Date.parse(String(record.last_legacy_verified_at||""));
  if(!Number.isFinite(verified) || Date.now()-verified>24*60*60_000 ||
     verified>Date.now()+60_000)return null;
  const now=new Date();
  periodStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
  periodEnd=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
 }else return null;
 const now=Date.now();
 const start=Date.parse(periodStart),end=Date.parse(periodEnd);
 if(!Number.isFinite(start)||!Number.isFinite(end)||now<start||now>=end)return null;
 if(process.env.VERCEL_ENV==="production"){
  const cutover=Date.parse(String(process.env.SHARED_USAGE_CUTOVER_AT||""));
  // A member who is already partway through a billing period MUST have an
  // explicitly reconciled opening wallet, never an auto-created empty one.
  // Periods starting after the approved cutover may begin normally at zero.
  if(start<cutover){
   const sql=await checkedDb();
   const rows=await sql`SELECT period_end,limit_uses,completed_uses,reserved_uses
    FROM public.shared_ai_usage_periods
    WHERE member_key=${memberKey} AND entitlement_key=${"existing_400_v1"}
    AND period_start=${periodStart}::timestamptz LIMIT 1`;
   if(rows.length!==1)return null;
   const wallet=rows[0],completed=Number(wallet.completed_uses),
    reserved=Number(wallet.reserved_uses);
   if(iso(wallet.period_end)!==periodEnd ||
      Number(wallet.limit_uses)!==400 ||
      !Number.isInteger(completed)||!Number.isInteger(reserved) ||
      completed<0||reserved<0||completed+reserved>400)return null;
  }
 }
 return {memberKey,entitlementKey:"existing_400_v1",periodStart,periodEnd,limitUses:400};
}
export async function reserveSharedUsage(
 email:string,coach:QuotaCoach,requestKey:string
):Promise<QuotaResult>{
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))return {status:"invalid_request"};
 if(!["fitness","budgeting","life"].includes(coach))return {status:"invalid_coach"};
 const permit=await resolveCurrentSharedUsage(email);
 if(!permit)return {status:"not_entitled"};
 const sql=await checkedDb();
 const rows=await sql`SELECT public.shared_ai_reserve(
  ${permit.memberKey},${permit.entitlementKey},
  ${permit.periodStart}::timestamptz,${permit.periodEnd}::timestamptz,
  ${permit.limitUses},${requestKey},${coach}
 ) AS status`;
 const status=String(rows[0]?.status||"unavailable");
 return status==="reserved"?{status,permit}:{status};
}
export async function settleSharedUsage(
 email:string,coach:QuotaCoach,requestKey:string,
 outcome:"completed"|"released"|"uncertain"
):Promise<string>{
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey) ||
    !["fitness","budgeting","life"].includes(coach) ||
    !["completed","released","uncertain"].includes(outcome))return "invalid";
 const memberKey=sharedUsageMemberKey(email,root());
 if(!memberKey)return "invalid";
 const sql=await checkedDb();
 // Settlement may finish after subscription state changes. Match the exact
 // previously reserved request rather than re-authorizing a new allowance.
 const matches=await sql`SELECT entitlement_key,period_start
 FROM public.shared_ai_usage_requests
 WHERE member_key=${memberKey} AND coach=${coach} AND request_key=${requestKey}
 ORDER BY period_start DESC LIMIT 2`;
 if(matches.length!==1)return "missing_or_ambiguous";
 const rows=await sql`SELECT public.shared_ai_settle(
  ${memberKey},${String(matches[0].entitlement_key)},
  ${iso(matches[0].period_start)}::timestamptz,${requestKey},${outcome}
 ) AS status`;
 return String(rows[0]?.status||"unavailable");
}
