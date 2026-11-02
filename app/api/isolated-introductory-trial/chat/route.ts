/**
 * PR #251: one authenticated, preview-only usage boundary for all three coaches.
 * Does not import existing membership, billing, saved-workout, or budget mutation routes.
 * Public/production URLs always return 404. No customer trial is enabled here.
 */
import {isolatedTrialPreviewEnabled,resolveIsolatedIntroductoryAccount} from "@/lib/isolatedIntroductoryIdentity";
import {isolatedIntroductoryTrialPort} from "@/lib/isolatedIntroductoryTrialDb";
import {executeIsolatedIntroductoryMessage,type IntroCoach} from "@/lib/isolatedIntroductoryExecution";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
function providerToken(coach:IntroCoach){
 const names:Record<IntroCoach,string>={
  fitness:"PICKAXE_FITNESS_COACH_DEPLOYMENT_TOKEN",
  budgeting:"PICKAXE_BUDGETING_COACH_DEPLOYMENT_TOKEN",
  life:"PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN"
 };
 return String(process.env[names[coach]]||"").trim();
}
function extractText(data:unknown):string{
 if(!data||typeof data!=="object")return "";
 const obj=data as Record<string,unknown>;
 for(const field of ["result","response","output","message","text"])
  if(typeof obj[field]==="string")return obj[field].trim();
 return extractText(obj.data);
}
export async function POST(request:Request){
 if(!isolatedTrialPreviewEnabled())return reply({ok:false,error:"Not found"},404);
 let body:Record<string,unknown>;
 try{
  const raw=await request.json();
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({ok:false,error:"Invalid request"},400);
  body=raw as Record<string,unknown>;
 }catch{return reply({ok:false,error:"Invalid request"},400);}
 const coach=body.coach;
 const key=body.requestKey;
 const message=body.message;
 if(!["fitness","budgeting","life"].includes(String(coach)) ||
    typeof key!=="string"||!/^[A-Za-z0-9_-]{16,100}$/.test(key) ||
    typeof message!=="string"||!message.trim()||message.length>6000)
  return reply({ok:false,error:"Invalid coaching request"},400);
 try{
  const account=await resolveIsolatedIntroductoryAccount();
  if(!account)return reply({ok:false,error:"Verified private trial account required"},403);
  const selected=coach as IntroCoach;
  const token=providerToken(selected);
  if(!token)return reply({ok:false,error:"Isolated coach provider not configured"},503);
  const result=await executeIsolatedIntroductoryMessage(
   account,selected,key,isolatedIntroductoryTrialPort,async()=>{
    // This call is reachable ONLY after verified identity and atomic reservation.
    // Per-tester Pickaxe userId preserves isolation from any real customer identity.
    const response=await fetch("https://api.pickaxe.co/v1/completions",{
     method:"POST",
     headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json"},
     body:JSON.stringify({message:message.trim(),userId:account.verifiedEmail,
       conversationId:`intro-${selected}-${key}`,stream:false}),
     cache:"no-store",signal:AbortSignal.timeout(100000)
    });
    if(!response.ok)throw Error("Provider failed");
    const payload=await response.json();
    if(payload?.success===false)throw Error("Provider failed");
    const answer=extractText(payload);
    if(!answer)throw Error("Provider returned no answer");
    return {kind:"generated" as const,value:answer};
   }
  );
  if(result.status==="completed")
   return reply({ok:true,response:result.value,coach:selected});
  if(result.status==="exhausted")return reply({ok:false,error:"Introductory allowance reached"},429);
  if(result.status.startsWith("duplicate_")||result.status==="replay_conflict")
   return reply({ok:false,error:"This request was already submitted"},409);
  if(["not_entitled","converted"].includes(result.status))return reply({ok:false,error:"Trial unavailable"},403);
  return reply({ok:false,error:"Trial request requires reconciliation; do not retry with a new ID"},503);
 }catch{return reply({ok:false,error:"Private trial service unavailable"},503);}
}
