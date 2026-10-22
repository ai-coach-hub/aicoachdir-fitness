import {membershipDb,getFitnessMembership} from "./fitnessMembershipDb";
import {stripeRequest} from "./stripeServer";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";

// Production activation requires separate, explicit deployment configuration.
// Off by default. Preview is pinned to the private Life Coach branch/database.
export function sharedUsageGateEnabled(){
 if(process.env.SHARED_USAGE_GATE_ENABLED!=="true")return false;
 if(process.env.VERCEL_ENV==="preview")
  return process.env.VERCEL_GIT_COMMIT_REF==="feature/life-coach-agent-sandbox-20261011";
 return process.env.VERCEL_ENV==="production" &&
        process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true";
}
export type QuotaCoach="fitness"|"budgeting"|"life";
export type QuotaPermit={
 memberKey:string;entitlementKey:string;periodStart:string;periodEnd:string;
 limitUses:number;
};
export type QuotaResult={status:string;permit?:QuotaPermit};

const root=()=>String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
const approvedPrices=()=>String(process.env.SHARED_USAGE_APPROVED_PRICE_IDS||"")
 .split(",").map(x=>x.trim()).filter(x=>/^price_[A-Za-z0-9]+$/.test(x));
const iso=(v:unknown)=>{
 const d=new Date(String(v));if(!Number.isFinite(d.getTime()))throw Error("Invalid billing date");
 return d.toISOString();
};
async function checkedDb(){
 if(!sharedUsageGateEnabled())throw Error("Shared AI usage is not enabled");
 const sql=membershipDb();
 if(process.env.VERCEL_ENV==="preview"){
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
  if(String(rows[0]?.branch_id||"")!=="br-autumn-breeze-auw38rgr")
   throw Error("Shared quota preview database branch mismatch");
 }
 return sql;
}
// Billing and account facts only come from the trusted membership database and
// independently verified Stripe records, NEVER a browser or Budgeting claim.
export async function resolveCurrentSharedUsage(email:string):Promise<QuotaPermit|null>{
 if(!sharedUsageGateEnabled())return null;
 const normalized=email.trim().toLowerCase(), secret=root();
 const memberKey=sharedUsageMemberKey(normalized,secret);
 if(!memberKey || normalized!==email || !approvedPrices().length)return null;
 const record=await getFitnessMembership(normalized);
 if(!record || record.access_active!==true)return null;
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
  const prices=approvedPrices();
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
 if(now<Date.parse(periodStart)||now>=Date.parse(periodEnd))return null;
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
