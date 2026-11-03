/**
 * Production trial ledger adapter. Unlike the private synthetic trial, this
 * uses a fixed verified production Neon branch and NO model/provider calls.
 * Call only after the independent Clerk/Stripe/Pickaxe/Terms admission gate.
 * Existing paid member and saved-tool flows are deliberately not replaced.
 */
import {membershipDb} from "@/lib/fitnessMembershipDb";
import {publicTrialReleaseGate} from "@/lib/publicIntroductoryTrialAdmission";
import type {IntroCoach,IntroOutcome} from "@/lib/isolatedIntroductoryExecution";
const PROD_BRANCH="br-sparkling-glitter-aucpz59d";
function gated(){
 if(!publicTrialReleaseGate(process.env))throw Error("Public trial is disabled");
}
export async function productionTrialSql(){
 gated();
 return productionTrialHistorySql();
}
/** Existing saved trial conversations stay readable even after a rollout pause. */
export async function productionTrialHistorySql(){
 if(process.env.VERCEL_ENV!=="production"||
    process.env.PUBLIC_INTRO_TRIAL_SCHEMA_READY!=="true")
  throw Error("Public trial history is unavailable");
 const sql=membershipDb();
 const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch`;
 if(String(rows[0]?.branch)!==PROD_BRANCH)throw Error("Public trial database branch mismatch");
 return sql;
}
const userId=(v:string)=>/^user_[A-Za-z0-9_-]{8,128}$/.test(v);
const memberKey=(v:string)=>/^member_[0-9a-f]{64}$/.test(v);
const requestId=(v:string)=>/^[A-Za-z0-9_-]{16,100}$/.test(v);
const isCoach=(v:string)=>["fitness","budgeting","life"].includes(v);
export async function reservePublicTrialTurn(account:{clerkId:string;memberKey:string},coach:IntroCoach,key:string):Promise<string>{
 if(!userId(account.clerkId)||!memberKey(account.memberKey)||!requestId(key)||!isCoach(coach))
  return "invalid";
 const sql=await productionTrialSql();
 const r=await sql`SELECT public.intro_trial_reserve(${account.clerkId},
 ${account.memberKey},${key},${coach}) AS status`;
 return String(r[0]?.status||"unavailable");
}
export async function storePublicTrialTurn(account:{clerkId:string;memberKey:string},coach:IntroCoach,key:string,message:string,response:string):Promise<void>{
 if(!userId(account.clerkId)||!memberKey(account.memberKey)||!requestId(key)||!isCoach(coach)||
  !message.trim()||message.length>6000||!response.trim()||response.length>30000)
  throw Error("Trial turn invalid");
 const sql=await productionTrialSql();
 const saved=await sql`INSERT INTO public.introductory_trial_history
   (clerk_user_id,request_key,coach,user_message,coach_response)
   SELECT ${account.clerkId},${key},${coach},${message.trim()},${response.trim()}
   WHERE EXISTS(
     SELECT 1 FROM public.introductory_trial_requests r
     JOIN public.introductory_trial_grants g ON g.clerk_user_id=r.clerk_user_id
     WHERE r.clerk_user_id=${account.clerkId} AND g.member_key=${account.memberKey}
     AND r.request_key=${key} AND r.coach=${coach} AND r.status='reserved'
   ) ON CONFLICT DO NOTHING RETURNING request_key`;
 if(saved.length!==1)throw Error("Trial response not persisted");
}
export async function settlePublicTrialTurn(account:{clerkId:string;memberKey:string},coach:IntroCoach,key:string,outcome:IntroOutcome):Promise<string>{
 if(!userId(account.clerkId)||!memberKey(account.memberKey)||!requestId(key)||!isCoach(coach)||
  !["completed","released","uncertain"].includes(outcome))return "invalid";
 const sql=await productionTrialSql();
 const r=await sql`SELECT public.intro_trial_settle(${account.clerkId},
 ${account.memberKey},${key},${coach},${outcome}) AS status`;
 return String(r[0]?.status||"unavailable");
}
export async function readPublicTrialTurns(clerkId:string,member:string){
 if(!userId(clerkId)||!memberKey(member))throw Error("Invalid identity");
 const sql=await productionTrialHistorySql();
 return sql`SELECT h.coach,h.user_message,h.coach_response,h.created_at
 FROM public.introductory_trial_history h
 JOIN public.introductory_trial_requests r
 ON r.clerk_user_id=h.clerk_user_id AND r.request_key=h.request_key
 JOIN public.introductory_trial_grants g ON g.clerk_user_id=r.clerk_user_id
 WHERE g.clerk_user_id=${clerkId} AND g.member_key=${member}
 AND r.status='completed'
 ORDER BY h.created_at ASC,h.request_key ASC LIMIT 100`;
}
