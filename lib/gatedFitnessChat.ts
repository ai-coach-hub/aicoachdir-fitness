import {currentUser} from "@clerk/nextjs/server";
import {memberHasFitnessAccess} from "./fitnessMembershipDb";
import {reserveSharedUsage,settleSharedUsage} from "./sharedUsageMeter";

// Only invoked when both release switches are ON. The private preview never
// touches real Pickaxe workouts; in preview it supports a synthetic smoke input.
export async function gatedFitnessChat(
 request:Request,realHandler:(request:Request)=>Promise<Response>
):Promise<Response>{
 let body:Record<string,unknown>;
 try{
  const value:unknown=await request.clone().json();
  body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 }catch{return Response.json({ok:false,error:"Invalid request"},{status:400});}
 // Workout completion and tracker updates are not AI generation.
 if(body.action==="complete_workout"||body.action==="sync_completed_workout")
  return process.env.VERCEL_ENV==="preview"?
   Response.json({ok:false,error:"Workout writes are disabled in private preview."},{status:403}):
   realHandler(request);
 const message=typeof body.message==="string"?body.message.trim():"";
 const requestKey=typeof body.requestKey==="string"?body.requestKey.trim():"";
 if(!message||message.length>12000||!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey))
  return Response.json({ok:false,error:"Message and stable request ID are required."},{status:400});
 if(process.env.VERCEL_ENV==="preview"&&message!=="TEST SHARED COUNTER")
  return Response.json({ok:false,error:"Private Fitness generation remains disabled to protect saved workouts. Only TEST SHARED COUNTER is supported."},{status:503});
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified")
  return Response.json({ok:false,error:"Verified member sign-in required."},{status:401});
 const email=primary.emailAddress.trim().toLowerCase();
 try{
  if(!await memberHasFitnessAccess(email,user.id))
   return Response.json({ok:false,error:"Active membership required."},{status:403});
 }catch{return Response.json({ok:false,error:"Membership verification unavailable."},{status:503});}
 let status:string;
 try{status=(await reserveSharedUsage(email,"fitness",requestKey)).status;}
 catch{return Response.json({ok:false,error:"Shared allowance temporarily unavailable. No AI request was made."},{status:503});}
 // Preserve the exact existing Fitness path through the member's current
 // paid billing period. Only a verified renewal creates the central quota.
 // This is never a fallback for invalid, canceled or exhausted membership.
 if(status==="pending_renewal" &&
    process.env.VERCEL_ENV==="production" &&
    process.env.SHARED_USAGE_MIGRATION_MODE==="rolling_renewal")
  return realHandler(request);
 if(status!=="reserved")return Response.json({ok:false,
  error:status==="exhausted"?"Shared monthly AI allowance reached.":
   status.startsWith("duplicate_")?"Request already submitted. Check saved chats before retrying.":
    "Shared allowance could not be verified. No AI request was made."
 },{status:status==="exhausted"?429:status.startsWith("duplicate_")?409:503});
 let response:Response;
 try{
  response=process.env.VERCEL_ENV==="preview"?
   Response.json({ok:true,response:"Private shared quota test passed (synthetic, no AI call).",previewSimulation:true}):
   await realHandler(request);
 }catch{
  response=Response.json({ok:false,error:"Fitness Coach could not complete the request."},{status:503});
 }
 const data=await response.clone().json().catch(()=>null);
 const generated=response.ok&&data?.ok===true&&
  (typeof data?.response==="string"||data?.savedPlanVerified===true);
 const noModel=generated&&data?.relaySource==="workout-history-unavailable";
 const outcome=generated&&!noModel?"completed":noModel?"released":"uncertain";
 try{
  const settled=await settleSharedUsage(email,"fitness",requestKey,outcome);
  if(settled!==outcome&&settled!=="already_"+outcome)
   return Response.json({ok:false,error:"Fitness quota reconciliation pending. Check saved chats before retrying."},{status:503});
 }catch{return Response.json({ok:false,error:"Fitness quota settlement unverified. Check saved chats before retrying."},{status:503});}
 return response;
}
