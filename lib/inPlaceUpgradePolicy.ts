/**
 * Preview-ready policy for changing an EXISTING Stripe subscription in place.
 * This module never calls Stripe and does not authorize charges by itself.
 * Keep public mutation endpoints disabled until price approvals, wallet
 * migrations, and the Fitness/Budgeting/Life integration have all passed QA.
 */
export type UpgradeTier = "starter" | "growth" | "premium" | "elite";
export type ApprovedTier = {
  tier: UpgradeTier;
  stripePriceId: string;
  monthlyUsdCents: number;
  includedMessages: number;
};
export type VerifiedUpgradeMember = {
  clerkUserId: string;
  membershipClerkUserId: string;
  stripeCustomerId: string;
  subscriptionCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionId: string;
  status: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currentPriceId: string;
  currentIncludedMessages: number;
  completedMessages: number;
  reservedMessages: number;
  priorLedgerReconciled: boolean;
};
export type UpgradeDecision =
  | {ok:true; current:ApprovedTier; target:ApprovedTier; preservePeriod:true; mustInvoiceBeforeGrant:true}
  | {ok:false; reason:string};
const stripeId=(value:string,prefix:string)=>new RegExp("^"+prefix+"_[a-zA-Z0-9]+$").test(value);
const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;

/**
 * Both the source subscription and destination tier MUST be explicitly
 * approved. An unfamiliar existing/grandfathered subscription is not treated
 * as a new tier and must be resolved separately without forcing repurchase.
 */
export function decideInPlaceUpgrade(
 member:VerifiedUpgradeMember,
 targetTier:UpgradeTier,
 approvedTiers:readonly ApprovedTier[],
 now:number=Date.now()
):UpgradeDecision {
 const deny=(reason:string):UpgradeDecision=>({ok:false,reason});
 if(!member || !/^user_[A-Za-z0-9_-]{8,128}$/.test(member.clerkUserId) ||
   member.clerkUserId!==member.membershipClerkUserId ||
   !stripeId(member.stripeCustomerId,"cus") ||
   member.stripeCustomerId!==member.subscriptionCustomerId ||
   !stripeId(member.stripeSubscriptionId,"sub") ||
   member.stripeSubscriptionId!==member.subscriptionId)
   return deny("member_binding_unverified");
 if(member.status!=="active" && member.status!=="trialing")return deny("subscription_not_active");
 const start=Date.parse(member.billingPeriodStart),end=Date.parse(member.billingPeriodEnd);
 if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||
   now<start||now>=end||end<=start)return deny("billing_period_unverified");
 if(!member.priorLedgerReconciled||!integer(member.currentIncludedMessages)||
   !integer(member.completedMessages)||!integer(member.reservedMessages)||
   member.completedMessages+member.reservedMessages>member.currentIncludedMessages)
   return deny("usage_ledger_unreconciled");
 if(!Array.isArray(approvedTiers)||approvedTiers.length===0)return deny("no_approved_catalog");
 const seenTiers=new Set<string>(),seenPrices=new Set<string>();
 for(const p of approvedTiers){
   if(!p||!["starter","growth","premium","elite"].includes(p.tier)||
     !stripeId(p.stripePriceId,"price")||
     !integer(p.monthlyUsdCents)||p.monthlyUsdCents<50||
     !integer(p.includedMessages)||p.includedMessages<1||
     seenTiers.has(p.tier)||seenPrices.has(p.stripePriceId))
     return deny("invalid_approved_catalog");
   seenTiers.add(p.tier);seenPrices.add(p.stripePriceId);
 }
 const current=approvedTiers.find(p=>p.stripePriceId===member.currentPriceId);
 const target=approvedTiers.find(p=>p.tier===targetTier);
 if(!current)return deny("current_plan_requires_review");
 if(!target)return deny("target_plan_not_approved");
 if(current.stripePriceId===target.stripePriceId)return deny("already_on_plan");
 if(target.monthlyUsdCents<=current.monthlyUsdCents||
   target.includedMessages<=current.includedMessages)return deny("not_an_upgrade");
 // In-place updates must not reset the current billing period or the ledger.
 // An actual API implementation must preview invoice/proration first,
 // re-verify subscription ownership, and grant the delta only after payment.
 return {ok:true,current,target,preservePeriod:true,mustInvoiceBeforeGrant:true};
}
