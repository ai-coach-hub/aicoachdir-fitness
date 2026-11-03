/**
 * Authenticated, same-origin, explicitly released trial enrollment.
 * No browser-supplied identity, Stripe write, Pickaxe access grant or model.
 */
import {currentUser} from "@clerk/nextjs/server";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {assessVerifiedPublicTrialUser,isPublicTrialPreflightAvailable} from "@/lib/publicIntroductoryTrialPreflight";
import {productionTrialSql} from "@/lib/publicIntroductoryTrialLedger";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!isPublicTrialPreflightAvailable())return respond({ok:false},404);
 // Explicit browser-origin validation and empty request body prevent CSRF and
 // forged request-supplied customer IDs/entitlement keys.
 const origin=request.headers.get("origin");
 if(!origin||origin!==new URL(request.url).origin)
  return respond({ok:false,error:"Invalid request origin"},403);
 if(Number(request.headers.get("content-length")||0)>0)
  return respond({ok:false,error:"Trial enrollment requires no request data"},400);
 try{
  const initialUser=await currentUser();
  if(!initialUser)return respond({ok:false,error:"Verified login required"},401);
  const admission=await assessVerifiedPublicTrialUser(initialUser.id);
  if(admission.kind!=="new"&&admission.kind!=="resume")
   return respond({ok:false,error:"Trial enrollment not available"},admission.kind==="deny"?403:503);
  const user=await currentUser();
  const emailObject=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
  if(!user||user.id!==initialUser.id||emailObject?.verification?.status!=="verified")
   return respond({ok:false,error:"Verified login required"},401);
  const email=emailObject.emailAddress.trim().toLowerCase();
  const key=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
  if(!key)return respond({ok:false,error:"Verified identity unavailable"},503);
  const sql=await productionTrialSql();
  if(admission.kind==="new"){
   await sql`INSERT INTO public.introductory_trial_grants(clerk_user_id,member_key)
   SELECT ${user.id},${key}
   WHERE NOT EXISTS(
      SELECT 1 FROM public.fitness_memberships WHERE email=${email}
   ) ON CONFLICT DO NOTHING`;
  }
  // Never reset an exhausted or converted grant, including after a double
  // submit, email alias change or a second Clerk login.
  const granted=await sql`SELECT message_limit,completed_uses,reserved_uses,
   converted_at FROM public.introductory_trial_grants
   WHERE clerk_user_id=${user.id} AND member_key=${key} LIMIT 2`;
  if(granted.length!==1||granted[0].converted_at!=null)
   return respond({ok:false,error:"Trial enrollment not available"},403);
  const remaining=Number(granted[0].message_limit)-Number(granted[0].completed_uses)-Number(granted[0].reserved_uses);
  if(!Number.isInteger(remaining)||remaining<0||remaining>15)
   return respond({ok:false,error:"Trial allowance unavailable"},503);
  return respond({ok:true,trialActive:true,remaining});
 }catch{return respond({ok:false,error:"Trial enrollment unavailable"},503);}
}
