/**
 * Public introductory-trial enrollment preflight. This module is deliberately
 * READ ONLY and may not be used to mint messages or grant paid membership.
 *
 * All dependent systems are checked; a missing/failed check MUST NOT be
 * interpreted as an absence of previous membership or trial use.
 */
import {currentUser} from "@clerk/nextjs/server";
import {membershipDb} from "@/lib/fitnessMembershipDb";
import {getTermsDatabase} from "@/lib/termsAcceptanceDb";
import {TERMS_VERSION} from "@/lib/termsMeta";
import {stripeRequest} from "@/lib/stripeServer";
import {getPickaxeUser,pickaxeUserHasFitnessAccess} from "@/lib/pickaxeAccess";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {assessPublicTrialAdmission,publicTrialReleaseGate,type TrialAdmission,type TrialAdmissionEvidence} from "@/lib/publicIntroductoryTrialAdmission";

const PROD_NEON_BRANCH="br-sparkling-glitter-aucpz59d";
const allTrue=()=>Boolean(
 process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID &&
 (process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_ID||process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_TOKEN) &&
 process.env.PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN
);
function noAccess(reason:Extract<TrialAdmission,{kind:"unavailable"}>["reason"]):TrialAdmission{
 return {kind:"unavailable",reason};
}
const item=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
async function stripePreviouslySubscribed(email:string):Promise<boolean>{
 // Ignore customer listings from aliases and deleted customers, but fail
 // closed on pagination or an ambiguous provider response.
 const listed=await stripeRequest("/customers?"+new URLSearchParams({email,limit:"100"}));
 if(!Array.isArray(listed.data)||listed.has_more!==false)throw Error("Stripe customer verification incomplete");
 for(const value of listed.data){
  const customer=item(value);
  if(customer.deleted===true)return true; // Treat deleted historical billing identity as ineligible
  if(String(customer.email||"").trim().toLowerCase()!==email)continue;
  const id=String(customer.id||"");
  if(!/^cus_[A-Za-z0-9]+$/.test(id))throw Error("Stripe customer ID invalid");
  const subs=await stripeRequest("/subscriptions?"+new URLSearchParams({customer:id,status:"all",limit:"100"}));
  if(!Array.isArray(subs.data)||subs.has_more!==false)throw Error("Historical Stripe subscription verification incomplete");
  // Active, paused, incomplete, canceled: a prior subscription is enough to
  // exclude a returning paid member from the one-time new-customer offer.
  if(subs.data.length>0)return true;
 }
 return false;
}
export function isPublicTrialPreflightAvailable():boolean{
 return publicTrialReleaseGate(process.env);
}
export async function assessVerifiedPublicTrialUser(expectedClerkId?:string):Promise<TrialAdmission>{
 if(!isPublicTrialPreflightAvailable())return noAccess("infrastructure_not_ready");
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified"||
    (expectedClerkId!==undefined&&user.id!==expectedClerkId))
  return {kind:"deny",reason:"unverified_identity"};
 const email=primary.emailAddress.trim().toLowerCase();
 const memberKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!memberKey)return {kind:"deny",reason:"unverified_identity"};

 // First establish that this process talks to the *production* database,
 // not a preview/test branch with incomplete historical paid records.
 const sql=membershipDb();
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS branch`;
 if(String(branch[0]?.branch)!==PROD_NEON_BRANCH)
  return noAccess("infrastructure_not_ready");
 const existing=await sql`SELECT stripe_status,access_active,stripe_customer_id,
   stripe_subscription_id FROM public.fitness_memberships
   WHERE email=${email} LIMIT 2`;
 if(existing.length>1)return noAccess("membership_unknown");
 const membership:TrialAdmissionEvidence["exactActiveMembership"]=existing.length
   ? String(existing[0].stripe_status||"").includes("legacy")?"legacy":
     existing[0].access_active===true?"paid":"recoverable"
   :"none";

 // Reverify ALL historical subscriptions, not only currently active Stripe
 // subscriptions. A previously canceled payer cannot restart a new trial.
 const hadStripe=await stripePreviouslySubscribed(email);
 const historicalStripe:TrialAdmissionEvidence["historicalStripe"]=hadStripe?"paid":"none";
 const legacy=await getPickaxeUser(email,{fallbackToList:true});
 const hasLegacy=legacy!=null && await pickaxeUserHasFitnessAccess(email,{fallbackToList:true});
 const historicalPickaxe:TrialAdmissionEvidence["historicalPickaxe"]=hasLegacy?"legacy":"none";

 const grants=await sql`SELECT clerk_user_id,member_key,completed_uses,reserved_uses,
  converted_at FROM public.introductory_trial_grants
  WHERE member_key=${memberKey} OR clerk_user_id=${user.id} LIMIT 2`;
 let lifetime:TrialAdmissionEvidence["lifetimeTrial"]="never";
 if(grants.length>1)return noAccess("lifetime_history_unknown");
 if(grants.length===1){
  const grant=grants[0];
  if(String(grant.member_key)!==memberKey||String(grant.clerk_user_id)!==user.id)
   return noAccess("lifetime_history_unknown");
  const completed=Number(grant.completed_uses),reserved=Number(grant.reserved_uses);
  if(!Number.isInteger(completed)||!Number.isInteger(reserved)||completed<0||reserved<0||
     completed+reserved>15)return noAccess("lifetime_history_unknown");
  lifetime=grant.converted_at!=null?"converted":completed+reserved>=15?"exhausted":"in_progress";
 }
 const termsSql=getTermsDatabase();
 const termsBranch=await termsSql`SELECT current_setting('neon.branch_id',true) AS branch`;
 if(String(termsBranch[0]?.branch)!==PROD_NEON_BRANCH)
  return noAccess("infrastructure_not_ready");
 const accepted=await termsSql`SELECT 1 FROM public.terms_acceptances
 WHERE email=${email} AND terms_version=${TERMS_VERSION}
 AND plan='AI Coach Directory Introductory Trial'
 AND price='$0' AND included_uses=15 LIMIT 1`;
 const procedures=await sql`SELECT
    to_regprocedure('public.intro_trial_reserve(text,text,text,text)') IS NOT NULL AS reserve_ok,
    to_regprocedure('public.intro_trial_settle(text,text,text,text,text)') IS NOT NULL AS settle_ok`;
 const e:TrialAdmissionEvidence={
  clerkId:user.id,verifiedEmail:email,emailOwnershipVerified:true,
  currentTermsAccepted:accepted.length===1,memberKey,
  exactActiveMembership:membership,historicalStripe,historicalPickaxe,
  lifetimeTrial:lifetime,trialSchemaVerified:grants!=null,
  coachProvidersReady:allTrue(),
  sharedMeterReady:procedures.length===1&&procedures[0].reserve_ok===true&&procedures[0].settle_ok===true
 };
 return assessPublicTrialAdmission(e);
}
