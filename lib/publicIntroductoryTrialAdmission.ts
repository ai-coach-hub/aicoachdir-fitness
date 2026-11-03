/**
 * Public-trial eligibility contract (PR #251), intentionally NOT wired into any
 * production route. Only server-verified records can satisfy these conditions.
 * A missing lookup is "unavailable", never "no membership".
 *
 * This module makes no billing, database, model or membership changes.
 */
export type VerifiedLookup<T extends string> = T | "unavailable";
export type TrialAdmissionEvidence = {
  clerkId: string;
  verifiedEmail: string;
  emailOwnershipVerified: boolean;
  currentTermsAccepted: boolean;
  memberKey: string;
  exactActiveMembership: VerifiedLookup<"none"|"paid"|"legacy"|"recoverable">;
  historicalStripe: VerifiedLookup<"none"|"paid"|"recoverable">;
  historicalPickaxe: VerifiedLookup<"none"|"legacy">;
  lifetimeTrial: VerifiedLookup<"never"|"in_progress"|"exhausted"|"converted">;
  trialSchemaVerified: boolean;
  coachProvidersReady: boolean;
  sharedMeterReady: boolean;
};
export type TrialAdmission =
  | {kind:"new";reason:"verified_new_member"}
  | {kind:"resume";reason:"existing_lifetime_trial"}
  | {kind:"deny";reason:"existing_member"|"trial_exhausted"|"trial_converted"|"unverified_identity"|"terms_required"}
  | {kind:"unavailable";reason:"membership_unknown"|"historical_billing_unknown"|"legacy_access_unknown"|"lifetime_history_unknown"|"infrastructure_not_ready"};
const deny=(reason:Extract<TrialAdmission,{kind:"deny"}>["reason"]):TrialAdmission=>({kind:"deny",reason});
const hold=(reason:Extract<TrialAdmission,{kind:"unavailable"}>["reason"]):TrialAdmission=>({kind:"unavailable",reason});
export function assessPublicTrialAdmission(e:TrialAdmissionEvidence):TrialAdmission{
  if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(e.clerkId)||
     !e.emailOwnershipVerified||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.verifiedEmail)||
     e.verifiedEmail!==e.verifiedEmail.trim().toLowerCase()||
     !/^member_[0-9a-f]{64}$/.test(e.memberKey))
    return deny("unverified_identity");
  if(e.exactActiveMembership==="unavailable")return hold("membership_unknown");
  if(e.historicalStripe==="unavailable")return hold("historical_billing_unknown");
  if(e.historicalPickaxe==="unavailable")return hold("legacy_access_unknown");
  if(e.exactActiveMembership!=="none"||e.historicalStripe!=="none"||e.historicalPickaxe!=="none")
    return deny("existing_member");
  if(e.lifetimeTrial==="unavailable")return hold("lifetime_history_unknown");
  if(e.lifetimeTrial==="converted")return deny("trial_converted");
  if(e.lifetimeTrial==="exhausted")return deny("trial_exhausted");
  if(!e.currentTermsAccepted)return deny("terms_required");
  if(!e.trialSchemaVerified||!e.coachProvidersReady||!e.sharedMeterReady)
    return hold("infrastructure_not_ready");
  if(e.lifetimeTrial==="in_progress")return {kind:"resume",reason:"existing_lifetime_trial"};
  return {kind:"new",reason:"verified_new_member"};
}

/** Never switch on production trial messaging as a side effect of deployment. */
export function publicTrialReleaseGate(env:Record<string,string|undefined>):boolean{
  return env.VERCEL_ENV==="production"&&
    env.PUBLIC_INTRO_TRIAL_ENABLED==="true"&&
    env.PUBLIC_INTRO_TRIAL_RELEASE_APPROVED==="true"&&
    env.PUBLIC_INTRO_TRIAL_METER_READY==="true"&&
    env.PUBLIC_INTRO_TRIAL_THREE_COACHES_READY==="true";
}
