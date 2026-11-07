/**
 * Private authenticated paid continuation, strictly TEST Stripe + isolated Neon.
 * A verified invoice/subscription is required before an atomic wallet reservation.
 * No production message entitlement, Pickaxe member mutation, or new billing.
 */
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {verifiedIsolatedPaidContinuation,TEST_ENTITLEMENT,TEST_MONTHLY_ALLOWANCE} from "@/lib/isolatedPaidContinuation";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
import type {IntroCoach} from "@/lib/isolatedIntroductoryExecution";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
const isCoach=(v:unknown):v is IntroCoach=>v==="fitness"||v==="budgeting"||v==="life";
function providerToken(coach:IntroCoach){
 if(coach==="fitness")return String(process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID||process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_TOKEN||"").trim();
 if(coach==="budgeting")return String(process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_TOKEN||process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_ID||"").trim();
 return String(process.env.PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN||"").trim();
}
function answerOf(data:unknown):string{
 if(!data||typeof data!=="object"||Array.isArray(data))return "";
 const obj=data as Record<string,unknown>;
 for(const field of ["result","response","output","message","text"])
  if(typeof obj[field]==="string")return obj[field].trim();
 return answerOf(obj.data);
}
export async function POST(request:Request){
 if(!isolatedTrialPreviewEnabled())return reply({ok:false},404);
 let body:Record<string,unknown>;
 try{const value=await request.json();
  if(!value||typeof value!=="object"||Array.isArray(value))return reply({ok:false,error:"Invalid request"},400);
  body=value as Record<string,unknown>;
 }catch{return reply({ok:false,error:"Invalid request"},400);}
 const coach=body.coach,key=body.requestKey,message=body.message;
 if(!isCoach(coach)||typeof key!=="string"||!/^[A-Za-z0-9_-]{16,100}$/.test(key)||
    typeof message!=="string"||!message.trim()||message.length>6000)
  return reply({ok:false,error:"Invalid coaching request"},400);
 const verified=await verifiedIsolatedPaidContinuation();
 if(!verified.ready)return reply({ok:false,error:"Paid TEST continuation is not verified",reason:verified.reason},403);
 const token=providerToken(coach);
 if(!token)return reply({ok:false,error:"Private coach deployment unavailable"},503);
 let sql:Awaited<ReturnType<typeof introHistorySql>>;
 try{sql=await introHistorySql();}catch{return reply({ok:false,error:"Isolated database unavailable"},503);}
 let reservation:string;
 try{
  const result=await sql`SELECT public.shared_ai_reserve(
    ${verified.memberKey},${TEST_ENTITLEMENT},
    ${verified.periodStart}::timestamptz,${verified.periodEnd}::timestamptz,
    ${TEST_MONTHLY_ALLOWANCE},${key},${coach}) AS status`;
  reservation=String(result[0]?.status||"unavailable");
 }catch{return reply({ok:false,error:"Paid message reservation unavailable"},503);}
 if(reservation!=="reserved"){
  if(reservation==="exhausted")return reply({ok:false,error:"Paid message allowance reached"},429);
  if(reservation.startsWith("duplicate_"))return reply({ok:false,error:"Message already submitted; do not resend"},409);
  return reply({ok:false,error:"Paid message could not be safely reserved",reason:reservation},409);
 }
 let outcome:"completed"|"released"|"uncertain"="uncertain";
 let responseText="";
 try{
  const response=await fetch("https://api.pickaxe.co/v1/completions",{
   method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify({message:message.trim(),stream:false}),
   cache:"no-store",signal:AbortSignal.timeout(100000)
  });
  if(response.status===404){outcome="released";}
  else{
   if(!response.ok)throw Error("Coach provider unavailable");
   const data:unknown=await response.json();
   if(data&&typeof data==="object"&&(data as {success?:boolean}).success===false)
    throw Error("Coach provider rejected request");
   const raw=answerOf(data);
   responseText=coach==="life"?cleanLifeCoachText(raw):raw;
   if(!responseText)throw Error("Empty provider response");
   const stored=await sql`INSERT INTO public.introductory_paid_history
     (clerk_user_id,member_key,entitlement_key,period_start,request_key,coach,user_message,coach_response)
     SELECT ${verified.clerkId},${verified.memberKey},${TEST_ENTITLEMENT},
      ${verified.periodStart}::timestamptz,${key},${coach},${message.trim()},${responseText}
     WHERE EXISTS(SELECT 1 FROM public.shared_ai_usage_requests
      WHERE member_key=${verified.memberKey} AND entitlement_key=${TEST_ENTITLEMENT}
      AND period_start=${verified.periodStart}::timestamptz
      AND request_key=${key} AND coach=${coach} AND status='reserved')
     ON CONFLICT DO NOTHING RETURNING request_key`;
   if(stored.length!==1)throw Error("Paid history persistence failed");
   outcome="completed";
  }
 }catch{
  // Timeout/ambiguous provider failure retains the reservation for audit.
  outcome="uncertain";
 }
 try{
  const settlement=await sql`SELECT public.shared_ai_settle(
   ${verified.memberKey},${TEST_ENTITLEMENT},
   ${verified.periodStart}::timestamptz,${key},${outcome}) AS status`;
  if(String(settlement[0]?.status)!==outcome)throw Error("Settlement disagreement");
 }catch{return reply({ok:false,error:"Message needs reconciliation; do not resend"},503);}
 if(outcome==="completed")return reply({ok:true,coach,response:responseText});
 if(outcome==="released")return reply({ok:false,error:"Private coach deployment unavailable; no message used"},503);
 return reply({ok:false,error:"Message needs reconciliation; do not resend"},503);
}
