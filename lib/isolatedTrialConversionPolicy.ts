/**
 * PR #251 isolated trial conversion policy. No production or Stripe side effects.
 * This is a pure decision function, NOT a subscription activation or migration.
 */
export type TrialConversionEvidence = {
  verifiedClerkUserId:string;
  trialGrantClerkUserId:string;
  paymentClerkUserId:string;
  stripeSessionPaid:boolean;
  stripeSubscriptionActive:boolean;
  stripeCustomerMatches:boolean;
  stripeSubscriptionMatches:boolean;
  trialAlreadyConverted:boolean;
  existingMemberConflict:boolean;
};
export function assessIsolatedTrialConversion(v:TrialConversionEvidence):
  "ready_to_record"|"already_converted"|"refuse" {
  if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(v.verifiedClerkUserId) ||
     v.verifiedClerkUserId!==v.trialGrantClerkUserId ||
     v.verifiedClerkUserId!==v.paymentClerkUserId ||
     v.existingMemberConflict)return "refuse";
  if(!v.stripeSessionPaid||!v.stripeSubscriptionActive||
     !v.stripeCustomerMatches||!v.stripeSubscriptionMatches)return "refuse";
  return v.trialAlreadyConverted?"already_converted":"ready_to_record";
}
