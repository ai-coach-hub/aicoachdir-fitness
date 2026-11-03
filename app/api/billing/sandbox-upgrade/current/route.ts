import {currentUser} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {sandboxUpgradeStatus,attachVerifiedSandboxWallet} from "@/lib/sandboxUpgradeReadiness";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const notFound=()=>NextResponse.json({ok:false,reason:"not_available"},{status:404});
const reply=(data:unknown,status=200)=>NextResponse.json(data,{
 status,headers:{"Cache-Control":"no-store"}
});
async function caller(){
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027")
  return null;
 const user=await currentUser();
 const primary=user?.emailAddresses.find(a=>a.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified")return null;
 return {email:primary.emailAddress.trim().toLowerCase(),id:user.id};
}
export async function GET(){
 const member=await caller();if(!member)return notFound();
 try{
  const state=await sandboxUpgradeStatus(member.email,member.id);
  if(!state.ok)return reply(state,409);
  // Never return member keys, customer IDs, subscription IDs or secrets.
  return reply({ok:true,ready:state.ready,enabled:state.enabled,
   currentTier:state.currentTier,options:state.options});
 }catch{return reply({ok:false,reason:"status_unavailable"},503);}
}
export async function POST(request:Request){
 const member=await caller();if(!member)return notFound();
 if(request.headers.get("origin")!==new URL(request.url).origin)
  return reply({ok:false,reason:"invalid_origin"},403);
 try{
  const result=await attachVerifiedSandboxWallet(member.email,member.id);
  return reply(result,result.ok?200:409);
 }catch{return reply({ok:false,reason:"setup_unavailable"},503);}
}
