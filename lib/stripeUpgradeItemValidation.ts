/**
 * Read-only validation of the exact Stripe subscription item to be updated.
 * This constructs *no Stripe mutation*. Only authenticated server code may
 * call a separate (future) invoice preview after ownership verification.
 */
import type {ApprovedTier} from "./inPlaceUpgradePolicy";

type Data=Record<string,unknown>;
const obj=(v:unknown):Data|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Data:null;
export type VerifiedStripeUpgradeItem={ok:true;subscriptionId:string;customerId:string;itemId:string;currentPriceId:string;targetPriceId:string}
  | {ok:false;reason:string};
export function validateStripeUpgradeItem(
  subscription:unknown,
  expected:{subscriptionId:string;customerId:string;currentPriceId:string},
  target:ApprovedTier
):VerifiedStripeUpgradeItem{
 const deny=(reason:string):VerifiedStripeUpgradeItem=>({ok:false,reason});
 const sub=obj(subscription);
 if(!sub||!/^sub_[A-Za-z0-9]+$/.test(expected.subscriptionId)||
   !/^cus_[A-Za-z0-9]+$/.test(expected.customerId)||
   !/^price_[A-Za-z0-9]+$/.test(expected.currentPriceId)||
   sub.id!==expected.subscriptionId||sub.customer!==expected.customerId||
   !["active","trialing"].includes(String(sub.status||"")))
   return deny("subscription_not_verified");
 if(!target||!/^price_[A-Za-z0-9]+$/.test(target.stripePriceId)||
   target.stripePriceId===expected.currentPriceId)
   return deny("target_not_approved");
 const items=obj(sub.items);
 const all=items?.data;
 if(items?.has_more===true||!Array.isArray(all)||all.length!==1)
   return deny("multiple_or_missing_subscription_items");
 const item=obj(all[0]),price=obj(item?.price),recurring=obj(price?.recurring);
 if(!item||typeof item.id!=="string"||
   !/^si_[A-Za-z0-9]+$/.test(item.id)||
   price?.id!==expected.currentPriceId||
   recurring?.interval!=="month"||recurring?.interval_count!==1||
   price?.currency!=="usd")
   return deny("subscription_item_not_verified");
 return {ok:true,subscriptionId:expected.subscriptionId,customerId:expected.customerId,
   itemId:item.id,currentPriceId:expected.currentPriceId,targetPriceId:target.stripePriceId};
}
