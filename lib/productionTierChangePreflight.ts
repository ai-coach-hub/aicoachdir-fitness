import {currentUser} from "@clerk/nextjs/server";
import {membershipDb,getFitnessMembership} from "./fitnessMembershipDb";
import {stripeRequest,stripeMode} from "./stripeServer";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {verifyWalletForTierChange} from "./productionTierWalletPreflight";

type Tier="starter"|"growth"|"premium"|"elite";
type Denial={ok:false;reason:string};
export type TierPreflight={ok:true;currentTier:Tier;targetTier:Tier;action:"upgrade"|"downgrade";remainingMessages:number;periodEnd:string}|Denial;
const deny=(reason:string):Denial=>({ok:false,reason});
const tiers:{tier:Tier;price:number;limit:number}[]=[
 {tier:"starter",price:900,limit:100},{tier:"growth",price:1500,limit:200},
 {tier:"premium",price:2500,limit:400},{tier:"elite",price:3500,limit:600}
];
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const validPrice=(v:unknown)=>typeof v==="string"&&/^price_[A-Za-z0-9]+$/.test(v);

/**
 * Server-only read-only preflight. It never submits a payment, creates a wallet,
 * reserves a message or updates the subscription. Production is fail-closed.
 */
export async function preflightTierChange(target:unknown):Promise<TierPreflight>{
 if(process.env.VERCEL_ENV!=="production"||
   process.env.PUBLIC_TIER_UPGRADES_ENABLED!=="true"||
   process.env.SHARED_USAGE_GATE_ENABLED!=="true"||
   process.env.SHARED_USAGE_PUBLIC_RELEASE_APPROVED!=="true"||
   stripeMode()!=="live")return deny("tier_changes_disabled");
 if(!tiers.some(t=>t.tier===target))return deny("invalid_tier");
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId)||user?.emailAddresses[0];
 const email=String(primary?.emailAddress||"").trim().toLowerCase();
 if(!user||!email||primary?.verification?.status!=="verified")return deny("identity_not_verified");
 const member=await getFitnessMembership(email);
 const customerId=String(member?.stripe_customer_id||"");
 const subscriptionId=String(member?.stripe_subscription_id||"");
 if(!member||member.access_active!==true||member.clerk_user_id!==user.id||
   !/^cus_[A-Za-z0-9]+$/.test(customerId)||
   !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))return deny("membership_not_verified");
 const raw=process.env.LIVE_FOUR_TIER_PRICE_CATALOG;
 let mapping:unknown;
 try{mapping=JSON.parse(raw||"");}catch{return deny("catalog_unavailable");}
 if(!isRecord(mapping)||Object.keys(mapping).length!==4||
   tiers.some(t=>!validPrice(mapping[t.tier]))||
   new Set(tiers.map(t=>mapping[t.tier])).size!==4)return deny("catalog_invalid");
 const sql=membershipDb();
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(branch.length!==1||branch[0].id!=="br-sparkling-glitter-aucpz59d")
   return deny("database_branch_mismatch");
 const [customer,sub]=await Promise.all([
   stripeRequest("/customers/"+encodeURIComponent(customerId)),
   stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId))
 ]);
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==email||
   sub.customer!==customerId||sub.id!==subscriptionId||sub.status!=="active"||
   sub.cancel_at_period_end===true||!!sub.pending_update||!!sub.schedule)
   return deny("subscription_not_changeable");
 const items=isRecord(sub.items)?sub.items:{};
 const data=Array.isArray(items.data)?items.data:[];
 if(items.has_more===true||data.length!==1||!isRecord(data[0])||!isRecord(data[0].price))
   return deny("subscription_items_not_verified");
 const priceId=String((data[0].price as Record<string,unknown>).id||"");
 const current=tiers.find(t=>mapping[t.tier]===priceId);
 if(!current)return deny("grandfathered_or_unknown_price_requires_review");
 const next=tiers.find(t=>t.tier===target)!;
 if(current.tier===next.tier)return deny("already_on_tier");
 const period=stripeUsageWindowFromVerifiedRecord(sub,{
   customerId,subscriptionId,priceId
 });
 if(!period.ok)return deny("stripe_period_not_verified");
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"");
 const memberKey=sharedUsageMemberKey(email,secret);
 if(!memberKey)return deny("member_key_unavailable");
 const rows=await sql`SELECT period_start,period_end,limit_uses,completed_uses,reserved_uses
 FROM public.shared_ai_usage_periods WHERE member_key=${memberKey}
 AND period_start=${period.periodStart}::timestamptz LIMIT 2`;
 const result=verifyWalletForTierChange({
   verifiedMember:true,uniqueLinkedSubscription:true,activeSubscription:true,
   grandfatheredPlan:false,approvedCurrentPrice:true,
   stripePeriodStart:period.periodStart,stripePeriodEnd:period.periodEnd,
   nowMillis:Date.now(),walletRows:rows.map(w=>({
     periodStart:new Date(String(w.period_start)).toISOString(),
     periodEnd:new Date(String(w.period_end)).toISOString(),
     limit:Number(w.limit_uses),completed:Number(w.completed_uses),
     reserved:Number(w.reserved_uses)
   }))
 });
 if(!result.ok)return deny(result.reason);
 if(result.allowance!==current.limit)return deny("wallet_tier_mismatch");
 return {ok:true,currentTier:current.tier,targetTier:next.tier,
   action:next.price>current.price?"upgrade":"downgrade",
   remainingMessages:result.remaining,periodEnd:result.periodEnd};
}
