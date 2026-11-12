/**
 * One-time POST-ACCESS-GROUP TEST-only native Pickaxe Fitness workout SAVE/readback.
 * Requires the pre-existing converted dedicated tester, signed-in Clerk,
 * exact isolated Neon branch and verified Stripe TEST subscription.
 * A new fixed request ID is separate from the original 404 attempt, which stays uncertain. No duplicate provider calls.
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
const REQUEST_KEY="native-fitness-post-access-qa-20261112";
const TEST_EMAIL="kyleunruh+trial251@gmail.com";
const MESSAGE="Create and save one simple 15-minute bodyweight workout plan for today in My Workouts. I have no equipment. Include a realistic warm-up, easy exercises and rest periods. Please use the normal workout validation and save action; do not say it is saved unless the actual plan has been stored and reopened.";
const send=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
import {FITNESS_ACCESS_GROUP_ID} from "@/lib/pickaxeAccess";
function hasRequiredGroup(value:unknown,depth=0):boolean {
 if(depth>8)return false;
 if(value===FITNESS_ACCESS_GROUP_ID)return true;
 if(Array.isArray(value))return value.some(v=>hasRequiredGroup(v,depth+1));
 if(!value||typeof value!=="object")return false;
 return Object.values(value as Record<string,unknown>).some(v=>hasRequiredGroup(v,depth+1));
}
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
 if(email!==TEST_EMAIL||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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

 // Independent reconciliation of the first test: keep its uncertain reservation
 // untouched, permit exactly one new request only after Pickaxe registration.
 try {
   const prior=await sql`SELECT status FROM public.shared_ai_usage_requests
     WHERE request_key='native-fitness-save-qa-20261107' AND coach='fitness' LIMIT 2`;
   const second=await sql`SELECT status FROM public.shared_ai_usage_requests
     WHERE request_key='native-fitness-post-registration-qa-20261110' AND coach='fitness' LIMIT 2`;
   const retry=await sql`SELECT status FROM public.shared_ai_usage_requests
     WHERE request_key=${REQUEST_KEY} AND coach='fitness' LIMIT 2`;
   if(prior.length!==1||prior[0].status!=="uncertain"||
      second.length!==1||second[0].status!=="uncertain"||retry.length!==0)
    return send({ok:false,error:"Fitness verification request state not safe; do not retry."},409);
   const response=await fetch("https://api.pickaxe.co/v1/studio/user/"+encodeURIComponent(email),{
    headers:{Authorization:`Bearer ${studioToken}`,Accept:"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(12000)
   });
   if(!response.ok)return send({ok:false,error:"Pickaxe registration must be independently verified before an AI call."},503);
   const root:unknown=await response.json();
   const top=root&&typeof root==="object"&&!Array.isArray(root)?root as Record<string,unknown>:{};
   const data=top.data&&typeof top.data==="object"&&!Array.isArray(top.data)?top.data as Record<string,unknown>:top;
   if(typeof data.email!=="string"||data.email.trim().toLowerCase()!==email)
    return send({ok:false,error:"Pickaxe identity mismatch; no AI request sent."},409);
   if(!hasRequiredGroup(data))
    return send({ok:false,error:"Fitness access group not yet verified; no AI request sent."},403);
 }catch{
   return send({ok:false,error:"Pickaxe and wallet preflight unavailable; no AI request sent."},503);
 }

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
    body:JSON.stringify({message:MESSAGE,conversationId:"fitness-chat-qa-post-access-20261112"})
  });
  const native=await executeIsolatedNativeFitnessSaveForTester(nativeRequest,user.id,email);
  providerStatus=native.status;
  const result:unknown=await native.json();
  const record=result&&typeof result==="object"&&!Array.isArray(result)?result as Record<string,unknown>:{};
  // Persist only whitelisted diagnostic metadata to the isolated TEST branch.
  // This never saves provider bodies, model output, token values or member PII.
  const diagnostic=record.providerDiagnostic;
  if(diagnostic&&typeof diagnostic==="object"&&!Array.isArray(diagnostic)){
   const info=diagnostic as Record<string,unknown>;
   const allowed=new Set(["not_received","deployment_not_found","authorization_rejected",
    "completion_route_not_found","usage_limited","unspecified_not_found","unclassified_http_failure"]);
   const classification=typeof info.classification==="string"&&allowed.has(info.classification)
    ? info.classification:"unclassified_http_failure";
   const httpStatus=typeof info.httpStatus==="number"&&Number.isInteger(info.httpStatus)&&
    info.httpStatus>=100&&info.httpStatus<=599?info.httpStatus:null;
   try{
    await sql`INSERT INTO public.isolated_fitness_provider_diagnostics
      (request_key,http_status,classification)
      VALUES (${REQUEST_KEY},${httpStatus},${classification})
      ON CONFLICT (request_key) DO NOTHING`;
   }catch{
    // Diagnostic failure must never trigger another provider call or wallet charge.
    console.warn("[isolated-fitness-save] diagnostic-store-unavailable");
   }
  }
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


/**
 * Read-only button readiness. The initial uncertain reservation is not cleared.
 * The exact dedicated trial account, registered Pickaxe identity and wallet
 * request history must all match before the separate one-time test is offered.
 */
export async function GET(){
 if(!isolatedTrialPreviewEnabled())return send({ok:false,error:"Unavailable"},404);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified"||
 user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||""))
  return send({ok:false,error:"Dedicated test login required"},403);
 const email=primary.emailAddress.trim().toLowerCase();
 if(email!==TEST_EMAIL)return send({ok:false,error:"Dedicated Fitness test email required"},403);
 const paid=await verifiedIsolatedPaidContinuation();
 if(!paid.ready||paid.clerkId!==user.id)return send({ok:false,error:"Test membership cannot be verified"},403);
 try{
  const sql=await introHistorySql();
  const rows=await sql`SELECT request_key,status FROM public.shared_ai_usage_requests
   WHERE coach='fitness' AND request_key IN
   ('native-fitness-save-qa-20261107','native-fitness-post-registration-qa-20261110',${REQUEST_KEY}) LIMIT 4`;
  const first=rows.filter(r=>r.request_key==="native-fitness-save-qa-20261107");
  const second=rows.filter(r=>r.request_key==="native-fitness-post-registration-qa-20261110");
  const newer=rows.filter(r=>r.request_key===REQUEST_KEY);
  const studioToken=String(process.env.PICKAXE_WORKSPACE_API_TOKEN||"").trim();
  if(!studioToken)return send({ok:false,error:"Pickaxe not configured"},503);
  const response=await fetch("https://api.pickaxe.co/v1/studio/user/"+encodeURIComponent(email),{
   headers:{Authorization:`Bearer ${studioToken}`,Accept:"application/json"},
   cache:"no-store",signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)return send({ok:false,error:"Pickaxe registration not confirmed"},503);
  const raw:unknown=await response.json();
  const outer=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const record=outer.data&&typeof outer.data==="object"&&!Array.isArray(outer.data)?outer.data as Record<string,unknown>:outer;
  if(typeof record.email!=="string"||record.email.trim().toLowerCase()!==email)
   return send({ok:false,error:"Pickaxe user mismatch"},409);
  if(!hasRequiredGroup(record))
   return send({ok:false,error:"Verified Fitness group assignment required; no AI request enabled"},403);
  const plan=await readLegacyMemberPlan(email,studioToken,{
   cacheReader:async owner=>{
    if(owner!==email)throw Error("Account mismatch");
    const cached=await sql`SELECT plan_json FROM public.workout_plan_cache WHERE email=${email} LIMIT 1`;
    return cached[0]?.plan_json??null;
   }
  });
  const previousUncertain=first.length===1&&first[0].status==="uncertain"&&
   second.length===1&&second[0].status==="uncertain";
  const newAttempt=newer.length===1?String(newer[0].status):null;
  return send({ok:true,mode:"isolated-preview",readOnly:true,
   ready:previousUncertain&&!newAttempt&&!plan.plan,
   registered:true,requiredFitnessGroupVerified:true,
   previousStatus:first.length===1?String(first[0].status):null,
   secondPreviousStatus:second.length===1?String(second[0].status):null,
   newAttemptStatus:newAttempt,savedPlanFound:!!plan.plan,
   previousReservationUntouched:true});
 }catch{
  return send({ok:false,error:"Preflight unavailable; do not start a test"},503);
 }
}
