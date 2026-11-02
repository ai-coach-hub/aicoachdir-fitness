/**
 * Trial-only execution boundary. Not imported by any production route.
 * The caller supplies server-verified identity/membership evidence; never a client assertion.
 * The SQL adapter must use the same dedicated lifetime grant on all three coaches.
 */
import {introductoryTrialEligible,type TrialIdentity} from "./introductoryTrialPolicy.ts";
export type IntroCoach="fitness"|"budgeting"|"life";
export type IntroOutcome="completed"|"released"|"uncertain";
export type VerifiedTrialAccount=TrialIdentity & {memberKey:string};
export type TrialPort={
 grant:(account:VerifiedTrialAccount)=>Promise<"granted"|"existing"|"denied">;
 reserve:(account:VerifiedTrialAccount,coach:IntroCoach,requestKey:string)=>Promise<string>;
 settle:(account:VerifiedTrialAccount,coach:IntroCoach,requestKey:string,outcome:IntroOutcome)=>Promise<string>;
};
const validKey=(key:string)=>/^[A-Za-z0-9_-]{16,100}$/.test(key);
const validCoach=(coach:string):coach is IntroCoach=>["fitness","budgeting","life"].includes(coach);
export async function executeIsolatedIntroductoryMessage<T>(
  account:VerifiedTrialAccount,coach:IntroCoach,requestKey:string,
  port:TrialPort,generate:()=>Promise<{kind:"generated";value:T}|{kind:"no-model"}>
):Promise<{status:string;value?:T}> {
 if(!validKey(requestKey)||!validCoach(coach)||!/^member_[0-9a-f]{64}$/.test(account.memberKey))
  return {status:"invalid"};
 // For existing grants caller must reverify prior eligibility and no paid/legacy membership.
 // A prior grant blocks issuing a *second* lifetime grant, not spending the
 // remaining balance of the original grant. The grant adapter returns "existing".
 if(!introductoryTrialEligible({...account,previouslyGranted:false}))
  return {status:"not_entitled"};
 let status:string;
 try {
  const granted=await port.grant(account);
  if(granted==="denied")return {status:"not_entitled"};
  status=await port.reserve(account,coach,requestKey);
 }catch{return {status:"unavailable"};}
 if(status!=="reserved")return {status};
 try {
  const outcome=await generate();
  if(outcome.kind==="no-model"){
   try{await port.settle(account,coach,requestKey,"released");}catch{return {status:"uncertain"};}
   return {status:"released"};
  }
  const settled=await port.settle(account,coach,requestKey,"completed");
  return settled==="completed"?{status:"completed",value:outcome.value}:{status:"uncertain"};
 }catch{
  // An ambiguous provider timeout may already have produced a paid completion.
  // Never return the slot automatically; retain it for reconciliation.
  try{await port.settle(account,coach,requestKey,"uncertain");}catch{}
  return {status:"uncertain"};
 }
}
