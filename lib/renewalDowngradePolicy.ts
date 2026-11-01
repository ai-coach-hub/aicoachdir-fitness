/** Side-effect-free policy for downgrades at renewal. Never modify a subscription
 *  or wallet immediately. Callers must reconcile Stripe schedule webhooks.
 */
export type RenewalDowngrade = {
 clerkUserId:string; linkedClerkUserId:string;
 stripeCustomerId:string; subscriptionCustomerId:string;
 stripeSubscriptionId:string; subscriptionId:string;
 status:string; cancelAtPeriodEnd:boolean;
 scheduleId:string|null; pendingUpdate:boolean;
 subscriptionItemId:string; subscriptionItemCount:number;
 currentPriceId:string; targetPriceId:string;
 currentMonthlyCents:number; targetMonthlyCents:number;
 currentMessages:number; targetMessages:number;
 periodEndEpoch:number; nowEpoch:number;
 otherActiveSubscriptionCount:number;
 walletReconciled:boolean;
};
export type DowngradeDecision =
 | {ok:true; action:"schedule_at_renewal"; preserveCurrentBenefits:true;
    noImmediateInvoice:true; effectiveAt:number;
    subscriptionId:string;subscriptionItemId:string;targetPriceId:string}
 | {ok:false;reason:string};
const validId=(s:string,p:string)=>new RegExp("^"+p+"_[A-Za-z0-9]+$").test(s);
export function planRenewalDowngrade(d:RenewalDowngrade):DowngradeDecision {
 const deny=(reason:string):DowngradeDecision=>({ok:false,reason});
 if(!d||!/^user_[A-Za-z0-9_-]{8,128}$/.test(d.clerkUserId)||
 d.clerkUserId!==d.linkedClerkUserId||
 !validId(d.stripeCustomerId,"cus")||d.stripeCustomerId!==d.subscriptionCustomerId||
 !validId(d.stripeSubscriptionId,"sub")||d.stripeSubscriptionId!==d.subscriptionId)
 return deny("unverified_member");
 if(d.status!=="active"||d.cancelAtPeriodEnd||d.scheduleId||
 d.pendingUpdate) return deny("subscription_not_changeable");
 if(!validId(d.subscriptionItemId,"si")||d.subscriptionItemCount!==1||
 d.otherActiveSubscriptionCount!==0) return deny("subscription_items_or_duplicates");
 if(!d.walletReconciled) return deny("wallet_unreconciled");
 if(!validId(d.currentPriceId,"price")||!validId(d.targetPriceId,"price")||
 d.currentPriceId===d.targetPriceId) return deny("price_unverified");
 const nums=[d.currentMonthlyCents,d.targetMonthlyCents,d.currentMessages,d.targetMessages,d.periodEndEpoch,d.nowEpoch];
 if(nums.some(n=>!Number.isSafeInteger(n))||d.currentMonthlyCents<=0||
 d.targetMonthlyCents<=0||d.currentMessages<=0||d.targetMessages<=0||
 d.periodEndEpoch<=d.nowEpoch) return deny("pricing_or_period_invalid");
 if(d.targetMonthlyCents>=d.currentMonthlyCents||
 d.targetMessages>=d.currentMessages) return deny("not_a_downgrade");
 return {ok:true,action:"schedule_at_renewal",preserveCurrentBenefits:true,
 noImmediateInvoice:true,effectiveAt:d.periodEndEpoch,
 subscriptionId:d.subscriptionId,subscriptionItemId:d.subscriptionItemId,
 targetPriceId:d.targetPriceId};
}
