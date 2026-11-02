import {currentUser} from "@clerk/nextjs/server";
import {introHistorySql,readTrialTurns} from "@/lib/isolatedTrialHistory";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const user=await currentUser();
  const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
  if(!user||primary?.verification?.status!=="verified")return Response.json({ok:false},{status:403});
  const sql=await introHistorySql();
  const grant=await sql`SELECT 1 FROM public.introductory_trial_grants WHERE clerk_user_id=${user.id} LIMIT 1`;
  if(!grant.length)return Response.json({ok:false},{status:403});
  const rows=await readTrialTurns(user.id);
  return Response.json({ok:true,turns:rows},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ok:false},{status:503});}
}
