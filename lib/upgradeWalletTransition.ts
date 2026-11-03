/**
 * Authoritative, side-effect-free shared wallet upgrade rules.
 * Called only AFTER a server-verified invoice is paid and a live Stripe
 * subscription shows the approved higher monthly recurring price.
 * No caller can create messages, change billing or authorize a new member here.
 */
export type WalletBefore = {
 memberKey:string; entitlementKey:string; periodStart:string; periodEnd:string;
 limitUses:number; completedUses:number; reservedUses:number;
};
export type VerifiedPaidPlanChange = {
 sameMemberKey:string; samePeriodStart:string; samePeriodEnd:string;
 oldPriceId:string; newPriceId:string; targetLimitUses:number;
 stripeInvoicePaid:boolean; stripeSubscriptionActive:boolean;
};
export type WalletChange =
 | {ok:true; nextLimitUses:number; retainedCompleted:number; retainedReserved:number; availableMessages:number}
 | {ok:false;reason:string};

const time=(s:string)=>Date.parse(s);
export function verifyWalletIncrease(
 before:WalletBefore,change:VerifiedPaidPlanChange
):WalletChange {
 const deny=(reason:string):WalletChange=>({ok:false,reason});
 if(!before||!change||!/^member_[0-9a-f]{64}$/.test(before.memberKey)||
   before.memberKey!==change.sameMemberKey||
   before.periodStart!==change.samePeriodStart||
   before.periodEnd!==change.samePeriodEnd||
   !Number.isFinite(time(before.periodStart))||
   !Number.isFinite(time(before.periodEnd))||
   time(before.periodEnd)<=time(before.periodStart)||
   !/^[A-Za-z0-9_-]{4,128}$/.test(before.entitlementKey))
   return deny("wallet_identity_or_period_mismatch");
 if(!change.stripeInvoicePaid||!change.stripeSubscriptionActive)
   return deny("payment_or_subscription_unconfirmed");
 if(!/^price_[A-Za-z0-9]+$/.test(change.oldPriceId)||
   !/^price_[A-Za-z0-9]+$/.test(change.newPriceId)||
   change.oldPriceId===change.newPriceId)
   return deny("stripe_prices_unverified");
 const nums=[before.limitUses,before.completedUses,before.reservedUses,change.targetLimitUses];
 if(nums.some(n=>!Number.isSafeInteger(n)||n<0)||
   before.limitUses<1||before.limitUses>10000||
   change.targetLimitUses>10000||
   before.completedUses+before.reservedUses>before.limitUses)
   return deny("wallet_counts_invalid");
 if(change.targetLimitUses<=before.limitUses)
   return deny("not_an_allowance_increase");
 return {ok:true,nextLimitUses:change.targetLimitUses,
   retainedCompleted:before.completedUses,retainedReserved:before.reservedUses,
   availableMessages:change.targetLimitUses-before.completedUses-before.reservedUses};
}
