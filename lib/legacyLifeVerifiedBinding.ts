// Private launch preparation: map an existing VERIFIED member's billing row
// to the owner-approved $15 / 400-use Life Coach entitlement.
// Does not query Stripe, change access, mint quota, or create subscriptions.
// Caller MUST verify the primary Clerk email and Stripe subscription/price
// separately before invoking the shared usage authorization bridge.
import {approvedLegacyLifeEntitlement} from "./legacyLifeCoachEntitlement";
import type {TrustedMemberBinding} from "./sharedAiVerifiedUsageBridge";
type MembershipRow={
 email:unknown;clerk_user_id:unknown;stripe_customer_id:unknown;
 stripe_subscription_id:unknown;stripe_status:unknown;access_active:unknown;
};
const valid=(v:unknown,re:RegExp)=>typeof v==="string"&&re.test(v);
export function legacyLifeVerifiedBinding(
 row:MembershipRow|null,
 session:{clerkUserId:string;verifiedPrimaryEmail:string},
 approvedPriceId:string
):TrustedMemberBinding|null{
 if(!row||row.access_active!==true||
   !["active","trialing"].includes(String(row.stripe_status))||
   !valid(session.clerkUserId,/^user_[A-Za-z0-9_-]{8,128}$/)||
   row.clerk_user_id!==session.clerkUserId||
   !valid(session.verifiedPrimaryEmail,/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||
   row.email!==session.verifiedPrimaryEmail.trim().toLowerCase()||
   !valid(row.stripe_customer_id,/^cus_[A-Za-z0-9]+$/)||
   !valid(row.stripe_subscription_id,/^sub_[A-Za-z0-9]+$/)||
   !valid(approvedPriceId,/^price_[A-Za-z0-9]+$/))
  return null;
 return {
  clerkUserId:session.clerkUserId,
  verifiedPrimaryEmail:session.verifiedPrimaryEmail.trim().toLowerCase(),
  stripeCustomerId:row.stripe_customer_id as string,
  stripeSubscriptionId:row.stripe_subscription_id as string,
  approvedPriceId,
  ...approvedLegacyLifeEntitlement()
 };
}
