/**
 * Introductory goal list reads the exact same member-owned Life goal records
 * as paid Life. Schema-readiness remains on after a pause/conversion.
 */
import {currentUser} from "@clerk/nextjs/server";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {productionTrialHistorySql} from "@/lib/publicIntroductoryTrialLedger";
import {listLifeGoals} from "@/lib/lifeCoachStore";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 if(process.env.VERCEL_ENV!=="production"||
    process.env.PUBLIC_INTRO_TRIAL_SCHEMA_READY!=="true"||
    process.env.PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED!=="true")
  return json({ok:false},404);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")
  return json({ok:false,error:"Verified sign-in required"},401);
 const email=primary.emailAddress.trim().toLowerCase();
 const key=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!key)return json({ok:false,error:"Goal ownership unavailable"},403);
 try{
  const sql=await productionTrialHistorySql();
  const rows=await sql`SELECT 1 FROM public.introductory_trial_grants
    WHERE clerk_user_id=${user.id} AND member_key=${key} LIMIT 1`;
  if(rows.length!==1)return json({ok:false,error:"Trial history not found"},404);
  const goals=await listLifeGoals(user.id);
  return json({ok:true,goals});
 }catch{return json({ok:false,error:"Saved Life goals temporarily unavailable"},503);}
}
