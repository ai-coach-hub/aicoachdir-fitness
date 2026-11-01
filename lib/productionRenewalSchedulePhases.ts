import {planRenewalDowngrade,type RenewalDowngrade} from "./renewalDowngradePolicy";
/**
 * Safe Stripe subscription-schedule phase *plan*, not a Stripe mutation.
 * Caller must create a schedule from the exact verified subscription, then
 * re-fetch and verify its phase boundaries before submitting an update.
 */
export function planStripeRenewalPhases(d:RenewalDowngrade,args:{
 periodStartEpoch:number;
 currentQuantity:number;
 currentEndEpoch:number;
}){
 const decision=planRenewalDowngrade(d);
 if(!decision.ok)return decision;
 const {periodStartEpoch,currentQuantity,currentEndEpoch}=args;
 if(!Number.isSafeInteger(periodStartEpoch)||
    periodStartEpoch>=decision.effectiveAt||
    !Number.isSafeInteger(currentEndEpoch)||currentEndEpoch!==decision.effectiveAt||
    currentQuantity!==1) return {ok:false as const,reason:"phase_bounds_unverified"};
 if(!/^price_[A-Za-z0-9]+$/.test(d.currentPriceId))
    return {ok:false as const,reason:"source_price_unverified"};
 return {ok:true as const,action:"prepare_stripe_schedule_update" as const,
  // Preserve existing paid benefits until the exact Stripe renewal boundary.
  phases:[
   {start_date:periodStartEpoch,end_date:decision.effectiveAt,
    items:[{price:d.currentPriceId,quantity:1}],proration_behavior:"none" as const},
   {start_date:decision.effectiveAt,
    items:[{price:decision.targetPriceId,quantity:1}],proration_behavior:"none" as const},
  ],
  end_behavior:"release" as const,
  noImmediateSubscriptionChange:true as const,
  noImmediateInvoice:true as const,
 };
}
