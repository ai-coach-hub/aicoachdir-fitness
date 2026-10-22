// Pure, side-effect-free eligibility resolution for the approved Life Coach expansion.
// The caller MUST retrieve this membership from the server, verify the Clerk primary
// email and user ID, and (when Stripe-linked) independently check paid-through status.
// This module NEVER grants a second 400-use wallet or calls Pickaxe/Stripe/Neon.
export type LifeExistingMemberRecord={
 email:string;
 clerk_user_id:string|null;
 stripe_customer_id:string|null;
 stripe_subscription_id:string|null;
 stripe_status:string|null;
 access_active:boolean;
};
export type LifeExistingEligibility=
 | {eligible:true;kind:"linked"|"verified_legacy";memberId:string;monthlyUses:400}
 | {eligible:false;reason:"identity_mismatch"|"inactive"|"billing_verification_required"|"legacy_verification_required"};

export function classifyExistingLifeMembership(
 record:LifeExistingMemberRecord|null,
 identity:{clerkUserId:string;verifiedPrimaryEmail:string},
 evidence:{linkedSubscriptionActive?:boolean;verifiedHistoricalLegacyAccess?:boolean}
):LifeExistingEligibility {
 const denied=(reason:Extract<LifeExistingEligibility,{eligible:false}>["reason"])=>
  ({eligible:false as const,reason});
 if(!record ||
    !/^user_[A-Za-z0-9_-]{8,128}$/.test(identity.clerkUserId) ||
    record.clerk_user_id!==identity.clerkUserId ||
    !identity.verifiedPrimaryEmail ||
    identity.verifiedPrimaryEmail.trim().toLowerCase()!==record.email.trim().toLowerCase())
   return denied("identity_mismatch");
 if(!record.access_active) return denied("inactive");
 const linked=Boolean(record.stripe_customer_id||record.stripe_subscription_id);
 if(linked){
  if(!record.stripe_customer_id || !record.stripe_subscription_id ||
     evidence.linkedSubscriptionActive!==true) return denied("billing_verification_required");
  return {eligible:true,kind:"linked",memberId:identity.clerkUserId,monthlyUses:400};
 }
 // A previously saved legacy flag alone is not new proof of paid entitlement.
 // A trusted, current historical-billing verification must explicitly approve it.
 if(record.stripe_status!=="legacy_pickaxe_member" ||
    evidence.verifiedHistoricalLegacyAccess!==true)
   return denied("legacy_verification_required");
 return {eligible:true,kind:"verified_legacy",memberId:identity.clerkUserId,monthlyUses:400};
}
