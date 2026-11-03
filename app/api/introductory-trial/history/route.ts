/**
 * Stable Clerk-owner history. Readable after conversion or a paused trial,
 * but never creates trial credits or paid membership access.
 */
import {currentUser} from "@clerk/nextjs/server";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {productionTrialHistorySql,readPublicTrialTurns} from "@/lib/publicIntroductoryTrialLedger";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const send=(obj:unknown,status=200)=>Response.json(obj,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 if(process.env.VERCEL_ENV!=="production"||process.env.PUBLIC_INTRO_TRIAL_SCHEMA_READY!=="true")
  return send({ok:false},404);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")
  return send({ok:false,error:"Sign in to view your trial conversations"},401);
 const email=primary.emailAddress.trim().toLowerCase();
 const memberKey=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!memberKey)return send({ok:false,error:"Conversation ownership unavailable"},403);
 try{
  const sql=await productionTrialHistorySql();
  const grants=await sql`SELECT completed_uses,reserved_uses,converted_at
  FROM public.introductory_trial_grants
  WHERE clerk_user_id=${user.id} AND member_key=${memberKey} LIMIT 2`;
  if(grants.length!==1)return send({ok:false,error:"No trial history for this account"},404);
  const turns=await readPublicTrialTurns(user.id,memberKey);
  const completed=Number(grants[0].completed_uses),reserved=Number(grants[0].reserved_uses);
  const remaining=15-completed-reserved;
  if(!Number.isInteger(remaining)||remaining<0||remaining>15)
   return send({ok:false,error:"Trial accounting unavailable"},503);
  return send({ok:true,turns,remaining,converted:grants[0].converted_at!=null});
 }catch{return send({ok:false,error:"Saved trial history unavailable"},503);}
}
