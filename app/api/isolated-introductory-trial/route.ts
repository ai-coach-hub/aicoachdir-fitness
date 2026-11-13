import {resolveIsolatedIntroductoryAccount,isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {isolatedIntroductoryTrialPort} from "@/lib/isolatedIntroductoryTrialDb";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
// Explicitly preview-only. Does not invoke a coach or mint usage credits.
export async function GET(){
 if(!isolatedTrialPreviewEnabled())return reply({ok:false},404);
 try{
  const account=await resolveIsolatedIntroductoryAccount();
  if(!account)return reply({ok:false,error:"Not eligible for isolated trial."},403);
  return reply({ok:true,eligible:true});
 }catch{return reply({ok:false,error:"Trial eligibility unavailable."},503);}
}
// Explicit tester onboarding (no unauthenticated or browser-supplied identity).
export async function POST(){
 if(!isolatedTrialPreviewEnabled())return reply({ok:false},404);
 try{
  const account=await resolveIsolatedIntroductoryAccount();
  if(!account)return reply({ok:false,error:"Not eligible for isolated trial."},403);
  const result=await isolatedIntroductoryTrialPort.grant(account);
  return result==="granted"||result==="existing"
   ?reply({ok:true,result}):reply({ok:false,error:"Trial grant unavailable."},403);
 }catch{return reply({ok:false,error:"Trial grant unavailable."},503);}
}
