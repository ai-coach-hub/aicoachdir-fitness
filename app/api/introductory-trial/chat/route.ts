/**
 * PRE-RELEASE: dedicated 15-message text-coaching trial.
 * No paid membership granted; no existing paid coach route modified.
 * Do not enable the public release gates before reviewing real coach actions.
 */
import {currentUser} from "@clerk/nextjs/server";
import {assessVerifiedPublicTrialUser,isPublicTrialPreflightAvailable} from "@/lib/publicIntroductoryTrialPreflight";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {reservePublicTrialTurn,storePublicTrialTurn,settlePublicTrialTurn} from "@/lib/publicIntroductoryTrialLedger";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
import {nativeTrialWriteRequested,nativeTrialWriteExplanation} from "@/lib/publicTrialNativeActionSafety";
import type {IntroCoach} from "@/lib/isolatedIntroductoryExecution";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const send=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const isCoach=(v:unknown):v is IntroCoach=>v==="fitness"||v==="budgeting"||v==="life";
function token(coach:IntroCoach){
 if(coach==="fitness")return String(process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID||"").trim();
 if(coach==="budgeting")return String(process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_ID||process.env.PICKAXE_BUDGETING_COACH_DEPLOYMENT_TOKEN||"").trim();
 return String(process.env.PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN||"").trim();
}
function answerOf(raw:unknown):string{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return "";
 const obj=raw as Record<string,unknown>;
 for(const k of ["result","response","output","message","text"])
  if(typeof obj[k]==="string")return String(obj[k]).trim();
 return answerOf(obj.data);
}
export async function POST(request:Request){
 if(!isPublicTrialPreflightAvailable())return send({ok:false},404);
 if(request.headers.get("origin")!==new URL(request.url).origin)
  return send({ok:false,error:"Invalid request origin"},403);
 if(Number(request.headers.get("content-length")||0)>8000)
  return send({ok:false,error:"Message too long"},413);
 let body:Record<string,unknown>;
 try{
  const raw:unknown=await request.json();
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
   return send({ok:false,error:"Invalid request"},400);
  body=raw as Record<string,unknown>;
 }catch{return send({ok:false,error:"Invalid request"},400);}
 const coach=body.coach,key=body.requestKey,message=body.message;
 if(!isCoach(coach)||typeof key!=="string"||
    !/^[A-Za-z0-9_-]{16,100}$/.test(key)||
    typeof message!=="string"||!message.trim()||message.length>6000)
  return send({ok:false,error:"Invalid coaching request"},400);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")
  return send({ok:false,error:"Verified login required"},401);
 const email=primary.emailAddress.trim().toLowerCase();
 const memberKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!memberKey)return send({ok:false,error:"Verified identity unavailable"},503);
 try{
  const admission=await assessVerifiedPublicTrialUser(user.id);
  if(admission.kind!=="resume")
   return send({ok:false,error:admission.kind==="new"?
     "Please enroll in your free trial first.":"Trial access is unavailable"},403);
 }catch{return send({ok:false,error:"Membership verification unavailable"},503);}
 // The conversational trial has no verified native tools yet. Reject a
 // likely mutation rather than claim a workout, budget or goal was saved.
 // This returns before reservation, so no trial message is charged.
 if(nativeTrialWriteRequested(coach,message))
  return send({ok:false,error:nativeTrialWriteExplanation(coach),nativeToolUnavailable:true},409);
 const deployment=token(coach);
 if(!deployment)return send({ok:false,error:"Coach service unavailable"},503);
 const account={clerkId:user.id,memberKey};
 let reservation:string;
 try{reservation=await reservePublicTrialTurn(account,coach,key);}
 catch{return send({ok:false,error:"Trial allowance unavailable"},503);}
 if(reservation!=="reserved"){
  if(reservation==="exhausted")return send({ok:false,error:"Your introductory messages are complete. Choose a membership to continue."},429);
  if(reservation.startsWith("duplicate_"))return send({ok:false,error:"Message already submitted. Review your saved chat."},409);
  return send({ok:false,error:"Trial request not authorized",reason:reservation},403);
 }
 let outcome:"completed"|"released"|"uncertain"="uncertain";
 let answer="";
 try{
  const model=await fetch("https://api.pickaxe.co/v1/completions",{
   method:"POST",
   headers:{Authorization:`Bearer ${deployment}`,"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify({message:message.trim(),userId:email,
    conversationId:`intro-${coach}-${user.id}`,stream:false}),
   cache:"no-store",signal:AbortSignal.timeout(100000)
  });
  if(model.status===404){outcome="released";}
  else{
   if(!model.ok)throw Error("Coach unavailable");
   const payload:unknown=await model.json();
   if(payload&&typeof payload==="object"&&(payload as {success?:boolean}).success===false)
    throw Error("Coach declined request");
   const raw=answerOf(payload);
   answer=coach==="life"?cleanLifeCoachText(raw):raw;
   if(!answer)throw Error("Coach returned no answer");
   await storePublicTrialTurn(account,coach,key,message.trim(),answer);
   outcome="completed";
  }
 }catch{
  // A timeout or unknown provider outcome may already have consumed a model
  // request. Do not release the slot until independent reconciliation.
  outcome="uncertain";
 }
 try{
  const state=await settlePublicTrialTurn(account,coach,key,outcome);
  if(state!==outcome)throw Error("Ledger settlement discrepancy");
 }catch{return send({ok:false,error:"Message needs reconciliation. Please do not resend."},503);}
 if(outcome==="completed")return send({ok:true,coach,response:answer});
 if(outcome==="released")return send({ok:false,error:"This coach is unavailable. No message was used."},503);
 return send({ok:false,error:"Message needs reconciliation. Please do not resend."},503);
}
