/**
 * Preview-only conversion attestation. Caller must already have checked Stripe
 * session ownership, paid status, active subscription, and saved paid access.
 * No Stripe API writes, no trial data deletion, no production DB connection.
 */
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {assessIsolatedTrialConversion} from "@/lib/isolatedTrialConversionPolicy";
export async function finalizeIsolatedTrialConversion(args:{
 clerkId:string;paymentClerkId:string;paid:boolean;active:boolean;
 customerMatches:boolean;subscriptionMatches:boolean;
}):Promise<"converted"|"already_converted"|"no_trial"|"refused">{
 const sql=await introHistorySql();
 const grants=await sql`SELECT clerk_user_id,converted_at FROM
 public.introductory_trial_grants WHERE clerk_user_id=${args.clerkId} LIMIT 1`;
 if(!grants.length)return "no_trial";
 const status=assessIsolatedTrialConversion({
  verifiedClerkUserId:args.clerkId,
  trialGrantClerkUserId:String(grants[0].clerk_user_id),
  paymentClerkUserId:args.paymentClerkId,
  stripeSessionPaid:args.paid,stripeSubscriptionActive:args.active,
  stripeCustomerMatches:args.customerMatches,
  stripeSubscriptionMatches:args.subscriptionMatches,
  trialAlreadyConverted:grants[0].converted_at!=null,
  existingMemberConflict:false
 });
 if(status==="refuse")return "refused";
 if(status==="already_converted")return "already_converted";
 const updated=await sql`UPDATE public.introductory_trial_grants
 SET converted_at=now() WHERE clerk_user_id=${args.clerkId}
 AND converted_at IS NULL RETURNING clerk_user_id`;
 return updated.length===1?"converted":"already_converted";
}
