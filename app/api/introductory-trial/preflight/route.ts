/**
 * Public signup admission PRECHECK. No trial grants, no checkout,
 * no model execution, no membership mutations.
 */
import {assessVerifiedPublicTrialUser,isPublicTrialPreflightAvailable} from "@/lib/publicIntroductoryTrialPreflight";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(obj:unknown,status=200)=>Response.json(obj,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 if(!isPublicTrialPreflightAvailable())return json({ok:false},404);
 try{
  const result=await assessVerifiedPublicTrialUser();
  if(result.kind==="new"||result.kind==="resume")
   return json({ok:true,eligible:true,kind:result.kind});
  if(result.kind==="deny")return json({ok:true,eligible:false,reason:result.reason},403);
  return json({ok:false,eligible:false,reason:"verification_unavailable"},503);
 }catch{
  return json({ok:false,eligible:false,reason:"verification_unavailable"},503);
 }
}
