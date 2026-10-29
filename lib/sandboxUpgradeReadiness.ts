import {neon} from "@neondatabase/serverless";
import {stripeMode,stripeRequest} from "./stripeServer";
import {verifiedSandboxStripeAccount} from "./sandboxStripeAccountGuard";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {sandboxTierCatalogFor} from "./sandboxTierManifest";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
const QA_BRANCH="feature/verified-subscription-upgrade-policy-20261027";
const QA_NEON="br-young-salad-aubnf7xt";
const QA_EMAIL="kyleunruh+lifetest@gmail.com";
type Failure={ok:false;reason:string};
type Valid={ok:true;ready:boolean;enabled:boolean;currentTier:string;
 currentPriceId:string;currentLimit:number;memberKey:string;customerId:string;
 subscriptionId:string;periodStart:string;periodEnd:string;
 options:{tier:string;monthlyUsdCents:number;includedMessages:number}[]};
const reject=(reason:string):Failure=>({ok:false,reason});
const object=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
const db=()=>neon(process.env.UPGRADE_SANDBOX_DATABASE_URL||"");
export async function sandboxUpgradeStatus(email:string,clerkUserId:string):Promise<Valid|Failure>{
 if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!==QA_BRANCH||
   stripeMode()!=="test"||email!==QA_EMAIL||
   !/^user_[A-Za-z0-9_-]{8,128}$/.test(clerkUserId))return reject("not_available");
 const memberKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!memberKey||!process.env.UPGRADE_SANDBOX_DATABASE_URL)return reject("test_configuration_missing");
 if(!await verifiedSandboxStripeAccount())return reject("incorrect_test_stripe_account");
 const sql=db();
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(String(branch[0]?.id||"")!==QA_NEON)return reject("incorrect_test_database");
 const members=await sql`SELECT clerk_user_id,stripe_customer_id,stripe_subscription_id,access_active
   FROM public.fitness_memberships WHERE email=${email} LIMIT 2`;
 if(members.length!==1||members[0].clerk_user_id!==clerkUserId||
   members[0].access_active!==true)return reject("membership_not_verified");
 const customerId=String(members[0].stripe_customer_id||"");
 const subscriptionId=String(members[0].stripe_subscription_id||"");
 if(!/^cus_[A-Za-z0-9]+$/.test(customerId)||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
  return reject("billing_link_missing");
 const [customer,sub]=await Promise.all([
  stripeRequest("/customers/"+encodeURIComponent(customerId)),
  stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId))
 ]);
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==email||
  sub.customer!==customerId||sub.id!==subscriptionId||sub.status!=="active"||
  sub.pending_update||sub.cancel_at_period_end===true)return reject("subscription_not_ready");
 const items=object(sub.items),list=Array.isArray(items.data)?items.data:[];
 if(items.has_more===true||list.length!==1)return reject("subscription_items_unverified");
 const priceId=String(object(object(list[0]).price).id||"");
 const catalog=sandboxTierCatalogFor("preview","test");
 if(!catalog.ok)return reject("catalog_not_ready");
 const current=catalog.catalog.find(t=>t.stripePriceId===priceId);
 if(!current)return reject("unknown_test_plan");
 const period=stripeUsageWindowFromVerifiedRecord(sub,{customerId,subscriptionId,priceId});
 if(!period.ok)return reject("billing_period_unverified");
 if(Date.now()<Date.parse(period.periodStart)||Date.now()>=Date.parse(period.periodEnd))
  return reject("billing_period_expired");
 const wallets=await sql`SELECT entitlement_key,period_end,limit_uses,completed_uses,reserved_uses
  FROM public.shared_ai_usage_periods WHERE member_key=${memberKey}
    AND period_start=${period.periodStart}::timestamptz LIMIT 2`;
 if(wallets.length>1)return reject("ambiguous_test_wallet");
 if(wallets.length===1){
  const w=wallets[0],limit=Number(w.limit_uses),
    used=Number(w.completed_uses),reserved=Number(w.reserved_uses);
  if(new Date(String(w.period_end)).toISOString()!==period.periodEnd||
    limit!==current.includedMessages||used<0||reserved<0||used+reserved>limit)
    return reject("wallet_needs_operator_review");
 }
 return {ok:true,ready:wallets.length===1,
  enabled:process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED==="true",
  currentTier:current.tier,currentPriceId:priceId,currentLimit:current.includedMessages,
  memberKey,customerId,subscriptionId,
  periodStart:period.periodStart,periodEnd:period.periodEnd,
  options:catalog.catalog.filter(t=>t.monthlyUsdCents>current.monthlyUsdCents)
   .map(t=>({tier:t.tier,monthlyUsdCents:t.monthlyUsdCents,
     includedMessages:t.includedMessages}))
 };
}
// Attaches the exact existing paid-upgrade test wallet without resetting any prior
// completed or reserved messages. Never touches the original or live data.
export async function attachVerifiedSandboxWallet(email:string,clerkUserId:string){
 const v=await sandboxUpgradeStatus(email,clerkUserId);
 if(!v.ok)return v;
 if(v.ready)return {ok:true as const,ready:true};
 const sql=db();
 const source=await sql`SELECT w.member_key,w.entitlement_key,w.period_start,w.period_end,
   w.limit_uses FROM public.ai_upgrade_intents i
  JOIN public.shared_ai_usage_periods w ON w.member_key=i.member_key
    AND w.entitlement_key=i.entitlement_key AND w.period_start=i.period_start
  WHERE i.stripe_customer_id=${v.customerId}
    AND i.stripe_subscription_id=${v.subscriptionId}
    AND i.target_price_id=${v.currentPriceId}
    AND i.period_start=${v.periodStart}::timestamptz
    AND i.period_end=${v.periodEnd}::timestamptz
    AND i.state='applied' AND w.limit_uses=${v.currentLimit} LIMIT 2`;
 if(source.length!==1||new Date(String(source[0].period_end)).toISOString()!==v.periodEnd)
  return reject("paid_test_wallet_not_unique");
 const origin=source[0];
 await sql`INSERT INTO public.shared_ai_usage_periods(
   member_key,entitlement_key,period_start,period_end,
   limit_uses,completed_uses,reserved_uses)
  SELECT ${v.memberKey},entitlement_key,period_start,period_end,
   limit_uses,completed_uses,reserved_uses FROM public.shared_ai_usage_periods
  WHERE member_key=${String(origin.member_key)}
    AND entitlement_key=${String(origin.entitlement_key)}
    AND period_start=${v.periodStart}::timestamptz
    AND limit_uses=${v.currentLimit}
  ON CONFLICT DO NOTHING`;
 const checked=await sandboxUpgradeStatus(email,clerkUserId);
 return checked.ok&&checked.ready?{ok:true as const,ready:true}:
  reject("wallet_setup_needs_review");
}
