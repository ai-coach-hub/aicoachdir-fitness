/**
 * Private and strictly read-only Fitness persistence diagnostic.
 * A successful read is NOT proof of a newly executed Pickaxe save.
 * No AI request, membership change, schema creation or wallet reservation.
 */
import {currentUser} from "@clerk/nextjs/server";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {readLegacyMemberPlan} from "@/lib/legacyWorkoutRead";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});

export async function GET(){
 if(!isolatedTrialPreviewEnabled())return response({ok:false},404);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified"||
    user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||""))
  return response({ok:false,error:"Dedicated verified test login required"},403);
 const email=primary.emailAddress.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return response({ok:false,error:"Invalid verified test identity"},403);
 try{
  // The same attested isolated Neon connection is used for both identity and cache.
  const sql=await introHistorySql();
  const [grants,members]=await Promise.all([
   sql`SELECT 1 FROM public.introductory_trial_grants
     WHERE clerk_user_id=${user.id} AND converted_at IS NOT NULL LIMIT 2`,
   sql`SELECT 1 FROM public.fitness_memberships
     WHERE clerk_user_id=${user.id} AND email=${email} AND access_active=true
       AND stripe_subscription_id IS NOT NULL LIMIT 2`
  ]);
  if(grants.length!==1||members.length!==1)
   return response({ok:false,error:"Converted isolated tester not verified"},403);
  const studioToken=String(process.env.PICKAXE_WORKSPACE_API_TOKEN||"").trim();
  if(!studioToken)return response({ok:false,error:"Read-only Pickaxe access unavailable"},503);
  // No fallback to STORAGE_URL / production. Only the isolated, verified sql object.
  const result=await readLegacyMemberPlan(email,studioToken,{
   cacheReader:async memberEmail=>{
    if(memberEmail!==email)throw Error("Member mismatch");
    const rows=await sql`SELECT plan_json FROM public.workout_plan_cache
      WHERE email=${email} LIMIT 1`;
    return rows[0]?.plan_json??null;
   }
  });
  return response({ok:true,mode:"isolated-preview",readOnly:true,
   found:result.plan!==null,source:result.source,
   // A found plan proves readback only. It does NOT certify a new save action.
   savedThroughCurrentTrialVerified:false});
 }catch{
  return response({ok:false,error:"Isolated Fitness readback unavailable"},503);
 }
}
