import {neon} from "@neondatabase/serverless";
import {stripeMode,stripeRequest} from "./stripeServer";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {resolveSandboxAllowance} from "./sandboxVerifiedAllowance";
import {verifiedSandboxStripeAccount} from "./sandboxStripeAccountGuard";

// Preview-only lookup for the isolated tiered wallet. Never loads the
// production membership database and never creates allowance rows.
export async function sandboxSharedUsagePermit(email:string){
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027"||
  process.env.UPGRADE_SANDBOX_SHARED_METER_ENABLED!=="true"||
  stripeMode()!=="test")return null;
 if(!await verifiedSandboxStripeAccount())return null;
 const normalized=email.trim().toLowerCase();
 if(normalized!==email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized))return null;
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"");
 const memberKey=sharedUsageMemberKey(normalized,secret);
 const db=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 if(!memberKey||!db)return null;
 const sql=neon(db);
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
 if(String(branch[0]?.branch_id||"")!=="br-young-salad-aubnf7xt")
  throw new Error("Shared meter isolated branch mismatch");
 const memberships=await sql`SELECT stripe_customer_id,stripe_subscription_id,access_active,clerk_user_id
 FROM public.fitness_memberships WHERE email=${normalized} LIMIT 2`;
 if(memberships.length!==1||memberships[0].access_active!==true||
 !/^user_[A-Za-z0-9_-]{8,128}$/.test(String(memberships[0].clerk_user_id||"")))
 return null;
 const customerId=String(memberships[0].stripe_customer_id||""),
 subscriptionId=String(memberships[0].stripe_subscription_id||"");
 if(!/^cus_[A-Za-z0-9]+$/.test(customerId)||
 !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))return null;
 const [customer,sub]=await Promise.all([
  stripeRequest("/customers/"+encodeURIComponent(customerId)),
  stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId))
 ]);
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==normalized)
  return null;
 const rows=await sql`SELECT member_key,entitlement_key,period_start,period_end,
 limit_uses,completed_uses,reserved_uses
 FROM public.shared_ai_usage_periods WHERE member_key=${memberKey}
 AND period_start <= now() AND period_end > now()
 ORDER BY period_start DESC LIMIT 2`;
 if(rows.length!==1)return null;
 const w=rows[0];
 const wallet={memberKey:String(w.member_key),entitlementKey:String(w.entitlement_key),
 periodStart:new Date(String(w.period_start)).toISOString(),
 periodEnd:new Date(String(w.period_end)).toISOString(),
 limitUses:Number(w.limit_uses),completedUses:Number(w.completed_uses),
 reservedUses:Number(w.reserved_uses)};
 const result=resolveSandboxAllowance({vercelEnv:process.env.VERCEL_ENV,
 stripeMode:stripeMode(),customerId,subscriptionId,memberKey,subscription:sub,wallet});
 if(!result.ok)return null;
 return {memberKey:result.memberKey,entitlementKey:result.entitlementKey,
 periodStart:result.periodStart,periodEnd:result.periodEnd,limitUses:result.limitUses};
}
