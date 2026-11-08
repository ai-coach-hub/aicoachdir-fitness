/**
 * One-time, TEST-only native Pickaxe Fitness workout SAVE/readback.
 * Requires the pre-existing converted dedicated tester, signed-in Clerk,
 * exact isolated Neon branch and verified Stripe TEST subscription.
 * One fixed request ID prevents any repeated provider call even after timeouts.
 * No checkout, new trial, live billing or production DB writes.
 */
import {currentUser} from "@clerk/nextjs/server";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {verifiedIsolatedPaidContinuation,TEST_ENTITLEMENT,TEST_MONTHLY_ALLOWANCE} from "@/lib/isolatedPaidContinuation";
import {executeIsolatedNativeFitnessSaveForTester} from "@/app/api/fitness/chat/route";
import {readLegacyMemberPlan} from "@/lib/legacyWorkoutRead";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
const REQUEST_KEY="native-fitness-save-qa-20261107";
const MESSAGE="Create and save one simple 15-minute bodyweight workout plan for today in My Workouts. I have no equipment. Include a realistic warm-up, easy exercises and rest periods. Please use the normal workout validation and save action; do not say it is saved unless the actual plan has been stored and reopened.";
const send=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!isolatedTrialPreviewEnabled())return send({ok:false,error:"Not available"},404);
 // Strictly same origin. A third-party site cannot cause a paid-test-model call.
 const origin=request.headers.get("origin");
 if(!origin||origin!==new URL(request.url).origin)
  return send({ok:false,error:"Same-origin test action required"},403);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified"||
   user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||""))
  return send({ok:false,error:"Dedicated verified test account required"},403);
 const email=primary.emailAddress.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return send({ok:false,error:"Test identity invalid"},403);
 const paid=await verifiedIsolatedPaidContinuation();
 if(!paid.ready||paid.clerkId!==user.id)
  return send({ok:false,error:"Existing converted Stripe TEST membership not verified"},403);
 let sql:Awaited<ReturnType<typeof introHistorySql>>;
 try{sql=await introHistorySql();}catch{return send({ok:false,error:"Isolated database unavailable"},503);}
 // Fail closed if test identity was already used for a saved plan.
 const studioToken=String(process.env.PICKAXE_WORKSPACE_API_TOKEN||"").trim();
 if(!studioToken)return send({ok:false,error:"Pickaxe workout storage unavailable"},503);
 let storedBefore=false;
 try{
   const existing=await readLegacyMemberPlan(email,studioToken,{
    cacheReader:async owner=>{
     if(owner!==email)throw Error("Owner mismatch");
     const rows=await sql`SELECT plan_json FROM public.workout_plan_cache WHERE email=${email} LIMIT 1`;
     return rows[0]?.plan_json??null;
    }
   });
   storedBefore=existing.plan!==null;
 }catch{return send({ok:false,error:"Existing workout could not be safely inspected"},503);}
 if(storedBefore)return send({ok:false,error:"A saved plan already exists; do not overwrite it for QA"},409);
 let reserved="";
 try{
  const rows=await sql`SELECT public.shared_ai_reserve(
    ${paid.memberKey},${TEST_ENTITLEMENT},
    ${paid.periodStart}::timestamptz,${paid.periodEnd}::timestamptz,
    ${TEST_MONTHLY_ALLOWANCE},${REQUEST_KEY},'fitness') AS status`;
  reserved=String(rows[0]?.status||"unavailable");
 }catch{return send({ok:false,error:"Test message reservation unavailable"},503);}
 if(reserved!=="reserved")
  return send({ok:false,error:"One-time Fitness test was already attempted or is unavailable. Do not retry or start checkout.",reservation:reserved},409);

 let outcome:"completed"|"uncertain"="uncertain";
 let savedPlanVerified=false;
 let providerStatus=503;
 try{
  const nativeRequest=new Request(request.url,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message:MESSAGE,conversationId:"fitness-chat-qa-native-save-20261107"})
  });
  const native=await executeIsolatedNativeFitnessSaveForTester(nativeRequest,user.id,email);
  providerStatus=native.status;
  const result:unknown=await native.json();
  const record=result&&typeof result==="object"&&!Array.isArray(result)?result as Record<string,unknown>:{};
  savedPlanVerified=native.ok&&record.ok===true&&record.savedPlanVerified===true;
  if(savedPlanVerified){
   // The native Fitness driver already checked the actual Pickaxe write/readback.
   // Independently read it again with the same identity; do not accept chat prose.
   const after=await readLegacyMemberPlan(email,studioToken,{
    cacheReader:async owner=>{
     if(owner!==email)throw Error("Owner mismatch");
     const rows=await sql`SELECT plan_json FROM public.workout_plan_cache WHERE email=${email} LIMIT 1`;
     return rows[0]?.plan_json??null;
    }
   });
   savedPlanVerified=after.plan!==null;
   if(savedPlanVerified)outcome="completed";
  }
 }catch{outcome="uncertain";}
 try{
  const rows=await sql`SELECT public.shared_ai_settle(
    ${paid.memberKey},${TEST_ENTITLEMENT},
    ${paid.periodStart}::timestamptz,${REQUEST_KEY},${outcome}) AS status`;
  if(String(rows[0]?.status)!==outcome)throw Error("Settlement mismatch");
 }catch{return send({ok:false,error:"Fitness attempt needs wallet reconciliation; do not retry"},503);}
 if(outcome==="completed")return send({ok:true,verified:true,savedPlanVerified:true,mode:"isolated-preview",testMessageUsed:1});
 return send({ok:false,verified:false,savedPlanVerified:false,providerStatus,
  error:"A real Pickaxe save was not independently confirmed. The one-time attempt is held for investigation; do not retry or use another account."},503);
}
