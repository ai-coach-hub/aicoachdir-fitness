import {membershipDb,getFitnessMembership} from "./fitnessMembershipDb";
import {stripeRequest} from "./stripeServer";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {approvedSharedPriceIds} from "./sharedUsagePriceApproval";

// Independent, operator-authorized complimentary 10-response launch wallet.
// Paid memberships must be re-verified with Stripe on each reserve.
// No existing provider balance or 400-use wallet is modified.
export type LifeLaunchPermit={memberKey:string;periodStart:string;periodEnd:string};
const enabled=()=>process.env.VERCEL_ENV==="production" &&
 process.env.LIFE_COACH_LIVE_ENABLED==="true" &&
 process.env.LIFE_LAUNCH_ALLOWANCE_ENABLED==="true" &&
 process.env.SHARED_USAGE_GATE_ENABLED==="true" &&
 process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED==="true" &&
 process.env.SHARED_USAGE_MIGRATION_MODE==="rolling_renewal";
const iso=(v:unknown)=>{const d=new Date(String(v));if(!Number.isFinite(d.getTime()))throw Error("Bad date");return d.toISOString();};
async function sql(){const db=membershipDb();const rows=await db`SELECT current_setting('neon.branch_id',true) AS branch_id`;if(String(rows[0]?.branch_id)!=="br-sparkling-glitter-aucpz59d")throw Error("Wrong production branch");return db;}
export async function verifiedLifeLaunchPermit(email:string):Promise<LifeLaunchPermit|null>{
 if(!enabled()||email!==email.trim().toLowerCase())return null;
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 const memberKey=sharedUsageMemberKey(email,secret);
 if(!memberKey)return null;
 if(String(process.env.SHARED_USAGE_NONBILLABLE_TEST_EMAILS||"").split(",")
  .map(s=>s.trim().toLowerCase()).includes(email))return null;
 const m=await getFitnessMembership(email);
 if(!m||m.access_active!==true||!m.stripe_customer_id||!m.stripe_subscription_id)return null;
 const customerId=String(m.stripe_customer_id),subscriptionId=String(m.stripe_subscription_id);
 if(!/^cus_[A-Za-z0-9]+$/.test(customerId)||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))return null;
 const customer=await stripeRequest("/customers/"+encodeURIComponent(customerId));
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==email)return null;
 const sub=await stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId));
 if(sub.id!==subscriptionId||sub.customer!==customerId||!["active","trialing"].includes(String(sub.status)))return null;
 const db=await sql();
 const rows=await db`SELECT config_value FROM public.billing_config WHERE config_key=${"stripe_fitness_price_id:live"} LIMIT 1`;
 const prices=approvedSharedPriceIds({environment:"production",billingCurrentPrice:rows[0]?.config_value,
  extraApprovedPrices:String(process.env.SHARED_USAGE_APPROVED_PRICE_IDS||"")});
 const matches=prices.map(priceId=>stripeUsageWindowFromVerifiedRecord(sub,{customerId,subscriptionId,priceId}))
  .filter((w):w is {ok:true;periodStart:string;periodEnd:string}=>w.ok);
 if(matches.length!==1)return null;
 const start=Date.parse(matches[0].periodStart),end=Date.parse(matches[0].periodEnd);
 const cutover=Date.parse(String(process.env.SHARED_USAGE_CUTOVER_AT||""));
 if(!Number.isFinite(cutover)||!Number.isFinite(start)||!Number.isFinite(end)||
    start>=cutover||Date.now()<start||Date.now()>=end)return null;
 return {memberKey,periodStart:iso(matches[0].periodStart),periodEnd:iso(matches[0].periodEnd)};
}
export async function lifeLaunchAvailability(email:string):Promise<"available"|"unavailable">{
 return (await verifiedLifeLaunchPermit(email))?"available":"unavailable";
}
export async function reserveLifeLaunch(email:string,requestKey:string):Promise<string>{
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))return "invalid";
 const permit=await verifiedLifeLaunchPermit(email);
 if(!permit)return "not_entitled";
 const db=await sql();
 const r=await db`SELECT public.life_launch_reserve(${permit.memberKey},${permit.periodStart}::timestamptz,${permit.periodEnd}::timestamptz,${requestKey}) AS status`;
 return String(r[0]?.status||"unavailable");
}
export async function settleLifeLaunch(email:string,requestKey:string,outcome:"completed"|"released"|"uncertain"):Promise<string>{
 const memberKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim());
 if(!memberKey||!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))return "invalid";
 const db=await sql();
 const rows=await db`SELECT period_start FROM public.life_launch_requests
 WHERE member_key=${memberKey} AND request_key=${requestKey} ORDER BY period_start DESC LIMIT 2`;
 if(rows.length!==1)return "missing_or_ambiguous";
 const result=await db`SELECT public.life_launch_settle(${memberKey},${iso(rows[0].period_start)}::timestamptz,${requestKey},${outcome}) AS status`;
 return String(result[0]?.status||"unavailable");
}
