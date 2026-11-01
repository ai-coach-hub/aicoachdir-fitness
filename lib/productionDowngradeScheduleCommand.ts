import {planStripeRenewalPhases} from "./productionRenewalSchedulePhases";
import type {RenewalDowngrade} from "./renewalDowngradePolicy";

/**
 * Read-only Stripe schedule command construction. No account or subscription
 * is modified. Execution requires an independently authenticated server
 * handler, a durable change request, and a successful schedule preview.
 */
export function verifiedDowngradeScheduleCommand(d:RenewalDowngrade,args:{
 periodStartEpoch:number;
 currentQuantity:number;
 currentEndEpoch:number;
 memberVerified:boolean;
 stripeAccountLive:boolean;
 durableChangeStored:boolean;
 currentPriceApproved:boolean;
 targetPriceApproved:boolean;
}){
 const deny=(reason:string)=>({ok:false as const,reason});
 if(!args.memberVerified||!args.stripeAccountLive||!args.durableChangeStored)
   return deny("authorization_or_intent_missing");
 if(!args.currentPriceApproved||!args.targetPriceApproved)
   return deny("price_not_approved");
 const plan=planStripeRenewalPhases(d,args);
 if(!plan.ok)return plan;
 return {ok:true as const,action:"schedule_at_renewal" as const,
   subscriptionId:d.subscriptionId,
   phases:plan.phases,
   end_behavior:plan.end_behavior,
   noImmediateSubscriptionChange:true as const,
   noImmediateInvoice:true as const};
}
