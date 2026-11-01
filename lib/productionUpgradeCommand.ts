/**
 * Production subscription change command contract. This is side-effect free and
 * keeps Stripe mutations disabled unless an authenticated application service
 * supplies a validated command and a durable intent already exists.
 */
export type TierMutationCommand={
  memberVerified:boolean;
  stripeAccountLive:boolean;
  subscriptionVerified:boolean;
  billingPeriodVerified:boolean;
  walletReconciled:boolean;
  durableIntentStored:boolean;
  legacyMembership:boolean;
  currentPriceId:string;
  targetPriceId:string;
  currentAmountCents:number;
  targetAmountCents:number;
  subscriptionId:string;
  subscriptionItemId:string;
  customerId:string;
  intentId:string;
};
type Result={ok:true;mode:"upgrade";path:string;params:Record<string,string>;idempotencyKey:string}|
 {ok:false;reason:string};
const id=(s:string,p:string)=>new RegExp("^"+p+"_[A-Za-z0-9]+$").test(s);
export function verifiedUpgradeCommand(s:TierMutationCommand):Result{
 const deny=(reason:string):Result=>({ok:false,reason});
 if(!s.memberVerified||!s.subscriptionVerified||!s.stripeAccountLive||!s.billingPeriodVerified)
  return deny("identity_or_subscription_unverified");
 if(!s.walletReconciled||!s.durableIntentStored)
  return deny("unreconciled_or_unstored_change");
 if(s.legacyMembership)return deny("legacy_requires_explicit_migration");
 if(!id(s.subscriptionId,"sub")||!id(s.customerId,"cus")||
 !id(s.subscriptionItemId,"si")||!id(s.currentPriceId,"price")||
 !id(s.targetPriceId,"price")||!/^upg_[a-f0-9]{36}$/.test(s.intentId))
  return deny("invalid_identifiers");
 if(s.currentPriceId===s.targetPriceId||
 !Number.isSafeInteger(s.currentAmountCents)||
 !Number.isSafeInteger(s.targetAmountCents)||
 s.targetAmountCents<=s.currentAmountCents)
  return deny("not_an_upgrade");
 return {ok:true,mode:"upgrade",path:"/subscriptions/"+s.subscriptionId,
   params:{
    "items[0][id]":s.subscriptionItemId,
    "items[0][price]":s.targetPriceId,
    "proration_behavior":"always_invoice",
    "payment_behavior":"pending_if_incomplete"
   },
   idempotencyKey:"tier_upgrade_"+s.intentId};
}
