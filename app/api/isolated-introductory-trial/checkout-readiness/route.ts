/**
 * Read-only preflight for the dedicated synthetic trial account.
 * Never initiates a payment or changes memberships. Fails closed on any
 * production / wrong-branch configuration.
 */
import {neon} from "@neondatabase/serverless";
import {isolatedTrialPreviewEnabled,resolveIsolatedIntroductoryAccount} from "@/lib/isolatedIntroductoryIdentity";
import {stripeMode,stripeConfigured} from "@/lib/stripeServer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 if(!isolatedTrialPreviewEnabled())return Response.json({ok:false},{status:404});
 try{
  const account=await resolveIsolatedIntroductoryAccount();
  if(!account)return Response.json({ok:false},{status:403});
  const url=process.env.STORAGE_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL||"";
  let isolatedBillingDatabase=false;
  if(url){
   const db=neon(url);
   const branch=await db`SELECT current_setting('neon.branch_id',true) AS id`;
   isolatedBillingDatabase=String(branch[0]?.id)==="br-spring-cloud-aui2mogd";
  }
  const stripeTestMode=stripeMode()==="test"&&stripeConfigured();
  const ready=stripeTestMode&&isolatedBillingDatabase;
  return Response.json({ok:ready,stripeTestMode,isolatedBillingDatabase},
   {status:ready?200:503,headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ok:false,stripeTestMode:false,isolatedBillingDatabase:false},
   {status:503,headers:{"Cache-Control":"no-store"}});}
}
