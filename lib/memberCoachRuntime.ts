import {currentUser} from "@clerk/nextjs/server";
import {memberHasFitnessAccess} from "./fitnessMembershipDb";
import {reserveSharedUsage,settleSharedUsage,type QuotaCoach} from "./sharedUsageMeter";

/**
 * Reusable, server-only AI generation boundary for new coaches.
 *
 * A coach provides only its provider implementation and a stable request ID.
 * Authenticated identity, historical-member recovery, subscription access,
 * the existing shared 400-use wallet and request settlement stay centralized.
 * Existing clients keep their established handlers until formally migrated.
 */
export type CoachGeneration<T> =
 | {kind:"generated"; value:T}
 | {kind:"no-model"};

export type CoachGenerationResult<T> =
 | {status:"completed"; value:T}
 | {status:"blocked"; reason:string}
 | {status:"uncertain"};

type CoachGenerationInput<T> = {
 coach:QuotaCoach;
 requestKey:string;
 generate:()=>Promise<CoachGeneration<T>>;
};

export async function runExistingMemberCoachGeneration<T>(
 input:CoachGenerationInput<T>
):Promise<CoachGenerationResult<T>> {
 const {coach,requestKey,generate}=input;
 // Always validate the stable replay ID BEFORE any auth, provider, or wallet
 // operation. The browser cannot choose a member email or subscription ID.
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))
  return {status:"blocked",reason:"invalid_request"};
 if(!["fitness","budgeting","life"].includes(coach))
  return {status:"blocked",reason:"unapproved_coach"};
 // The authenticated Clerk identity is authoritative. Never accept a caller-
 // supplied email or a second subscription to unlock another coach.
 let user:Awaited<ReturnType<typeof currentUser>>;
 try{user=await currentUser();}
 catch{return {status:"blocked",reason:"identity_unavailable"};}
 const primary=user?.emailAddresses.find(entry=>entry.id===user.primaryEmailAddressId);
 if(!user || !primary || primary.verification?.status!=="verified")
  return {status:"blocked",reason:"verified_sign_in_required"};
 const email=primary.emailAddress.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return {status:"blocked",reason:"invalid_identity"};
 try{
  if(!await memberHasFitnessAccess(email,user.id))
   return {status:"blocked",reason:"active_membership_required"};
 }catch{
  return {status:"blocked",reason:"membership_unavailable"};
 }
 // The ledger independently revalidates the source-of-truth membership,
 // billing status, approved monthly price and individual billing period.
 // A mid-cycle rolling migration returns pending_renewal without issuing
 // a fabricated opening credit or calling the new provider.
 let reserved:string;
 try{reserved=(await reserveSharedUsage(email,coach,requestKey)).status;}
 catch{return {status:"blocked",reason:"allowance_unavailable"};}
 if(reserved!=="reserved")return {status:"blocked",reason:reserved};
 try{
  const outcome=await generate();
  if(outcome.kind==="no-model"){
   const settled=await settleSharedUsage(email,coach,requestKey,"released");
   if(settled!=="released" && settled!=="already_released")
    return {status:"uncertain"};
   return {status:"blocked",reason:"no_model_request"};
  }
  const settled=await settleSharedUsage(email,coach,requestKey,"completed");
  if(settled!=="completed" && settled!=="already_completed")
   return {status:"uncertain"};
  return {status:"completed",value:outcome.value};
 }catch{
  // Once a provider is attempted, never silently refund uncertain work.
  // Operators can reconcile ambiguous use without granting a second credit.
  try{await settleSharedUsage(email,coach,requestKey,"uncertain");}
  catch{ /* retain reservation until an operator reconciles it */ }
  return {status:"uncertain"};
 }
}
