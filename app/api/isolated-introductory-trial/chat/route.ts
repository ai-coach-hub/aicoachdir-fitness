/**
 * PR #251: one authenticated, preview-only usage boundary for all three coaches.
 * Does not import existing membership, billing, saved-workout, or budget mutation routes.
 * Public/production URLs always return 404. No customer trial is enabled here.
 */
import {isolatedTrialPreviewEnabled,resolveIsolatedIntroductoryAccount} from "@/lib/isolatedIntroductoryIdentity";
import {isolatedIntroductoryTrialPort} from "@/lib/isolatedIntroductoryTrialDb";
import {saveTrialTurn} from "@/lib/isolatedTrialHistory";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
import {executeIsolatedIntroductoryMessage,type IntroCoach} from "@/lib/isolatedIntroductoryExecution";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
function diagnostic(stage:string,coach:IntroCoach,code?:number){
 if(!isolatedTrialPreviewEnabled())return;
 console.warn("[intro-trial-preview]",{stage,coach,...(code===undefined?{}:{httpStatus:code})});
}
function providerToken(coach:IntroCoach){
 const names:Record<IntroCoach,string>={
  fitness:"PICKAXE_FITNESS_DEPLOYMENT_TOKEN",
  budgeting:"PICKAXE_BUDGETING_COACH_DEPLOYMENT_TOKEN",
  life:"PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN"
 };
 const key=String(process.env[names[coach]]||"").trim();
 if(coach==="budgeting")return key||String(process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_ID||"").trim();
 return key;
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
  if(!token){diagnostic("provider_missing",selected);return reply({ok:false,error:`${selected==="life"?"Life":selected==="budgeting"?"Budgeting":"Fitness"} Coach is not configured in this private preview.`},503);}
  const result=await executeIsolatedIntroductoryMessage(
   account,selected,key,isolatedIntroductoryTrialPort,async()=>{
    // This call is reachable ONLY after verified identity and atomic reservation.
    // Per-tester Pickaxe userId preserves isolation from any real customer identity.
    let response:Response;
    try{response=await fetch("https://api.pickaxe.co/v1/completions",{
     method:"POST",
     headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json"},
     // Life and Budgeting use the minimal request that worked for Life Coach in this isolated trial.
     // The signed-in account and chat history remain isolated in this site\u0027s trial database.
     body:JSON.stringify(selected==="fitness"
       ?{message:message.trim(),userId:account.verifiedEmail,
         conversationId:`intro-${selected}-${key}`,stream:false}
       :{message:message.trim(),stream:false}),
     cache:"no-store",signal:AbortSignal.timeout(100000)
    });}catch(e){diagnostic(e instanceof Error&&e.name==="TimeoutError"?"provider_timeout":"provider_network_failure",selected);throw Error("Provider request failed");}
    if(!response.ok){
     diagnostic("provider_http_error",selected,response.status);
     // Pickaxe says the deployment does not exist: no model completion occurred.
     // Release this reservation instead of holding a message for reconciliation.
     if(response.status===404)return {kind:"no-model" as const};
     throw Error("Provider failed");
    }
    let payload:unknown;
    try{payload=await response.json();}catch{diagnostic("provider_invalid_json",selected);throw Error("Provider invalid response");}
    if(payload && typeof payload==="object" && (payload as {success?:boolean}).success===false){diagnostic("provider_rejected",selected);throw Error("Provider failed");}
    const rawAnswer=extractText(payload);
    const answer=selected==="life"?cleanLifeCoachText(rawAnswer):rawAnswer;
    if(!answer){diagnostic("provider_empty_response",selected);throw Error("Provider returned no answer");}
    try{await saveTrialTurn(account.clerkUserId,key,selected,message.trim(),answer);}catch{diagnostic("history_persist_failure",selected);throw Error("History persistence failed");}
    return {kind:"generated" as const,value:answer};
   }
  );
  if(result.status==="uncertain"||result.status==="unavailable")diagnostic("trial_"+result.status,selected);
  if(result.status==="completed")
   return reply({ok:true,response:result.value,coach:selected});
  if(result.status==="released")return reply({ok:false,error:"This coach\u0027s Pickaxe API deployment was not found. No trial message was used. Check the coach\u0027s API/MCP deployment ID in Pickaxe."},503);
  if(result.status==="exhausted")return reply({ok:false,error:"Introductory allowance reached"},429);
  if(result.status.startsWith("duplicate_")||result.status==="replay_conflict")
   return reply({ok:false,error:"This request was already submitted"},409);
  if(["not_entitled","converted"].includes(result.status))return reply({ok:false,error:"Trial unavailable"},403);
  return reply({ok:false,error:"Trial request requires reconciliation; do not retry with a new ID"},503);
 }catch{return reply({ok:false,error:"Private trial service unavailable"},503);}
}
