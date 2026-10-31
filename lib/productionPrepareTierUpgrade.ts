import {randomBytes} from "node:crypto";
import {currentUser} from "@clerk/nextjs/server";
import {membershipDb,getFitnessMembership} from "./fitnessMembershipDb";
import {stripeRequest,stripeMode} from "./stripeServer";
import {stripeUsageWindowFromVerifiedRecord} from "./stripeUsagePeriod";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";
import {verifyWalletForTierChange} from "./productionTierWalletPreflight";

type Tier="starter"|"growth"|"premium"|"elite";
type Denied={ok:false;reason:string};
const deny=(reason:string):Denied=>({ok:false,reason});
const tiers=[{tier:"starter",cents:900,messages:100},{tier:"growth",cents:1500,messages:200},
 {tier:"premium",cents:2500,messages:400},{tier:"elite",cents:3500,messages:600}] as const;
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const iso=(v:unknown)=>new Date(String(v)).toISOString();

/** Durable preparation ONLY. It never changes Stripe or charges anybody.
 * Each new intent is generated after fresh verified Clerk, Stripe, and wallet checks.
 * A pending intent blocks further attempts, rather than duplicate billing.
 */
export async function prepareProductionTierUpgrade(target:unknown):Promise<
 {ok:true;intentId:string;currentTier:Tier;targetTier:Tier;status:"prepared"}|Denied>{
 if(process.env.VERCEL_ENV!=="production"||
    process.env.PUBLIC_TIER_UPGRADES_ENABLED!=="true"||
    process.env.PRODUCTION_TIER_TRANSACTIONS_ENABLED!=="true"||
    stripeMode()!=="live")return deny("disabled");
 const chosen=tiers.find(x=>x.tier===target);
 if(!chosen)return deny("invalid_tier");
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId)||user?.emailAddresses[0];
 const email=String(primary?.emailAddress||"").trim().toLowerCase();
 if(!user||primary?.verification?.status!=="verified"||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return deny("identity_unverified");
 const m=await getFitnessMembership(email);
 const cust=String(m?.stripe_customer_id||""),subId=String(m?.stripe_subscription_id||"");
 if(!m||m.access_active!==true||m.clerk_user_id!==user.id||
    !/^cus_[A-Za-z0-9]+$/.test(cust)||!/^sub_[A-Za-z0-9]+$/.test(subId))
  return deny("membership_unverified");
 let map:Record<string,unknown>;
 try{map=obj(JSON.parse(String(process.env.LIVE_FOUR_TIER_PRICE_CATALOG||"")));}catch{return deny("catalog_missing");}
 if(Object.keys(map).length!==4||tiers.some(t=>!/^price_[A-Za-z0-9]+$/.test(String(map[t.tier]||"")))||
    new Set(tiers.map(t=>map[t.tier])).size!==4)return deny("catalog_invalid");
 const sql=membershipDb();
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(branch.length!==1||branch[0].id!=="br-sparkling-glitter-aucpz59d")
   return deny("database_branch_mismatch");
 const [customer,sub]=await Promise.all([
 stripeRequest("/customers/"+encodeURIComponent(cust)),
 stripeRequest("/subscriptions/"+encodeURIComponent(subId))]);
 if(customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==email||
    sub.id!==subId||sub.customer!==cust||sub.livemode!==true||
    sub.status!=="active"||sub.cancel_at_period_end===true||!!sub.pending_update||
    !!sub.schedule)return deny("stripe_unverified");
 const collection=obj(sub.items),items=Array.isArray(collection.data)?collection.data:[];
 if(collection.has_more===true||items.length!==1)return deny("subscription_items_invalid");
 const item=obj(items[0]),price=obj(item.price);
 const current=tiers.find(t=>map[t.tier]===price.id);
 if(!current||chosen.cents<=current.cents||
    !/^si_[A-Za-z0-9]+$/.test(String(item.id||"")))return deny("not_approved_upgrade");
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId:cust,subscriptionId:subId,priceId:String(price.id)});
 if(!window.ok)return deny("period_invalid");
 const memberKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!memberKey)return deny("wallet_identity_invalid");
 const wallets=await sql`SELECT entitlement_key,period_start,period_end,limit_uses,completed_uses,reserved_uses
 FROM public.shared_ai_usage_periods WHERE member_key=${memberKey}
 AND period_start=${window.periodStart}::timestamptz LIMIT 2`;
 const verified=verifyWalletForTierChange({
 verifiedMember:true,uniqueLinkedSubscription:true,activeSubscription:true,
 grandfatheredPlan:false,approvedCurrentPrice:true,
 stripePeriodStart:window.periodStart,stripePeriodEnd:window.periodEnd,nowMillis:Date.now(),
 walletRows:wallets.map(w=>({periodStart:iso(w.period_start),periodEnd:iso(w.period_end),
 limit:Number(w.limit_uses),completed:Number(w.completed_uses),reserved:Number(w.reserved_uses)}))});
 if(!verified.ok||wallets.length!==1||verified.allowance!==current.messages)
   return deny("wallet_not_reconciled");
 const old=await sql`SELECT id FROM public.ai_tier_change_intents
 WHERE stripe_subscription_id=${subId} AND state IN ('prepared','awaiting_payment') LIMIT 2`;
 if(old.length)return deny("change_already_pending");
 const intentId="upg_"+randomBytes(18).toString("hex");
 const created=await sql`INSERT INTO public.ai_tier_change_intents
 (id,member_key,entitlement_key,period_start,period_end,
 stripe_customer_id,stripe_subscription_id,stripe_item_id,old_price_id,target_price_id,
 expected_limit,target_limit,state)
 VALUES (${intentId},${memberKey},${String(wallets[0].entitlement_key)},
 ${window.periodStart}::timestamptz,${window.periodEnd}::timestamptz,
 ${cust},${subId},${String(item.id)},${String(price.id)},${String(map[chosen.tier])},
 ${current.messages},${chosen.messages},'prepared')
 ON CONFLICT DO NOTHING RETURNING id`;
 if(created.length!==1)return deny("change_already_pending");
 return {ok:true,intentId,currentTier:current.tier,targetTier:chosen.tier,status:"prepared"};
}
