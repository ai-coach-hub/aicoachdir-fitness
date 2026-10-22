import {verifySharedUsageServiceRequest,type SharedUsageServiceRequest} from "@/lib/shared-usage-service";
import {getFitnessMembership} from "@/lib/fitnessMembershipDb";
import {lifeTestStatus,previewLifeTestPeriod,previewLifeTestSubscription} from "@/lib/previewLifeTestEnrollment";
import {reservePreviewAiUse,settlePreviewAiUse} from "@/lib/previewAiUsage";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
const privatePreview=()=>process.env.VERCEL_ENV==="preview" &&
 process.env.VERCEL_GIT_COMMIT_REF==="feature/life-coach-agent-sandbox-20261011" &&
 process.env.PREVIEW_SHARED_USAGE_METER_ENABLED==="true";

export async function POST(request:Request) {
 // Never enable service-to-service writes against an unverified production DB.
 if(!privatePreview())return reply({ok:false,error:"Internal private usage test unavailable."},404);
 let body:SharedUsageServiceRequest;
 try {body=await request.json();}catch{return reply({ok:false,error:"Malformed usage request."},400);}
 const secret=process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"";
 if(!verifySharedUsageServiceRequest(body,request.headers.get("x-shared-usage-signature")||"",
   secret,Date.now())) return reply({ok:false,error:"Internal usage authentication failed."},401);
 const allow=(process.env.LIFE_COACH_TESTER_EMAILS||"")
  .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allow.includes(body.memberEmail))return reply({ok:false,error:"Private membership not enrolled."},403);
 try {
  // Never trust any membership/period/allowance ID from the Budgeting caller.
  const record=await getFitnessMembership(body.memberEmail);
  if(!record || record.access_active!==true ||
     !/^user_[A-Za-z0-9_-]{8,128}$/.test(String(record.clerk_user_id||"")))
    return reply({ok:false,error:"Verified private member record unavailable."},403);
  const memberId=String(record.clerk_user_id);
  const test=await lifeTestStatus(memberId);
  if(!test.active || test.limit!==3)
   return reply({ok:false,error:"Shared private period not enrolled."},403);
  const usage={memberId,subscriptionKey:previewLifeTestSubscription,
   periodStart:previewLifeTestPeriod,requestKey:body.requestKey,coach:"budgeting" as const};
  const result=body.action==="reserve"
   ? await reservePreviewAiUse(usage)
   : await settlePreviewAiUse(usage,body.outcome!);
  return reply({ok:true,result,mode:"private-usage-ledger"});
 }catch{
  return reply({ok:false,error:"Internal private quota ledger is unavailable."},503);
 }
}
