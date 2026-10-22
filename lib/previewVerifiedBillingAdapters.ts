// Private branch only. Server-authoritative READ adapters to support future
// shared AI usage; no production route imports this module. Does not mutate
// Stripe, Neon, Stripe prices, active memberships, or provider plans.
import {neon} from "@neondatabase/serverless";
import {stripeRequest,stripeMode} from "./stripeServer";
import {type PriorUsagePeriod} from "./sharedAiEntitlementPolicy";
import {type TrustedMemberBinding} from "./sharedAiVerifiedUsageBridge";

const previewBranch="feature/life-coach-agent-sandbox-20261011";
const expectedNeonBranch="br-autumn-breeze-auw38rgr";

function privateTestOnly(){
 if(process.env.VERCEL_ENV!=="preview" ||
    process.env.VERCEL_GIT_COMMIT_REF!==previewBranch ||
    stripeMode()!=="test")
  throw new Error("Isolated Stripe test mode and private Vercel Preview required.");
}

function checkedId(value:string,prefix:"cus"|"sub"|"price"){
 if(!new RegExp("^"+prefix+"_[A-Za-z0-9]+$").test(value))
  throw new Error("Invalid subscription identifier.");
}

export async function readVerifiedPreviewStripeBilling(binding:TrustedMemberBinding){
 privateTestOnly();
 checkedId(binding.stripeCustomerId,"cus");
 checkedId(binding.stripeSubscriptionId,"sub");
 checkedId(binding.approvedPriceId,"price");
 const customer=await stripeRequest("/customers/"+encodeURIComponent(binding.stripeCustomerId));
 const customerEmail=String(customer.email||"").trim().toLowerCase();
 if(customer.deleted===true ||
    !customerEmail || customerEmail!==binding.verifiedPrimaryEmail)
  throw new Error("Verified billing customer does not match member.");
 const subscription=await stripeRequest("/subscriptions/"+encodeURIComponent(binding.stripeSubscriptionId));
 if(String(subscription.customer||"")!==binding.stripeCustomerId ||
    String(subscription.id||"")!==binding.stripeSubscriptionId)
  throw new Error("Billing subscription/customer mismatch.");
 return {
  verifiedCustomerEmail:customerEmail,
  verifiedAt:new Date().toISOString(),
  subscription
 };
}

// Always verify the dedicated Neon branch before ANY usage ledger access.
// Never interpret an inaccessible prior ledger as an empty ledger.
export async function readPrivatePriorUsagePeriod(memberId:string):Promise<PriorUsagePeriod|null>{
 privateTestOnly();
 if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(memberId))
  throw new Error("Invalid member.");
 const url=process.env.LIFE_COACH_DATABASE_URL;
 if(!url)throw new Error("Private usage database is not configured.");
 const sql=neon(url);
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
 if(String(branch[0]?.branch_id||"")!==expectedNeonBranch)
  throw new Error("Private usage branch mismatch.");
 const results=await sql`
  SELECT subscription_key,period_start,period_end,limit_uses
  FROM preview_ai_usage_periods WHERE member_id=${memberId}
  ORDER BY period_end DESC LIMIT 1
 `;
 if(results.length===0)return null;
 const row=results[0];
 // Neo/Postgres returns ISO-like strings or Date depending on the adapter.
 const iso=(v:unknown)=>{
  const date=v instanceof Date?v:new Date(String(v));
  if(!Number.isFinite(date.getTime()))throw Error("Invalid stored billing period.");
  return date.toISOString();
 };
 const limit=Number(row.limit_uses);
 if(!Number.isSafeInteger(limit)||limit<1)
  throw new Error("Invalid stored limit.");
 return {
  clerkUserId:memberId,
  allowanceLedgerKey:String(row.subscription_key),
  includedUses:limit,
  periodStart:iso(row.period_start),
  periodEnd:iso(row.period_end)
 };
}
