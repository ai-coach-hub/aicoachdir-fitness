import {verifySharedUsageServiceRequest,type SharedUsageServiceRequest} from "@/lib/shared-usage-service";
import {resolvePrivatePreviewBudgetMember} from "@/lib/previewSharedMemberBinding";
import {lifeTestStatus,previewTestAvailable,previewLifeTestPeriod,previewLifeTestSubscription} from "@/lib/previewLifeTestEnrollment";
import {reservePreviewAiUse,settlePreviewAiUse} from "@/lib/previewAiUsage";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});

// Quota authority for the prepared general Budgeting gate. Preview-only until
// production subscription/legacy identity and ledger migrations are VERIFIED.
export async function POST(request:Request){
 if(!previewTestAvailable())
  return reply({ok:false,error:"Shared usage bridge is not yet released."},404);
 let command:SharedUsageServiceRequest;
 try{command=await request.json();}catch{
  return reply({ok:false,error:"Invalid usage command."},400);
 }
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 if(!verifySharedUsageServiceRequest(command,
  request.headers.get("x-shared-usage-signature")||"",secret,Date.now()))
  return reply({ok:false,error:"Invalid usage service authentication."},401);
 try{
  const member=await resolvePrivatePreviewBudgetMember(command.memberEmail);
  if(!member)return reply({ok:false,error:"Verified private member binding required."},403);
  const status=await lifeTestStatus(member);
  if(!status.active)return reply({ok:false,error:"Shared preview period is not enrolled."},403);
  const key={memberId:member,subscriptionKey:previewLifeTestSubscription,
   periodStart:previewLifeTestPeriod,requestKey:command.requestKey,coach:"budgeting" as const};
  const result=command.action==="reserve"
   ?await reservePreviewAiUse(key)
   :await settlePreviewAiUse(key,command.outcome!);
  return reply({ok:true,result,mode:"isolated-preview-only"});
 }catch{
  return reply({ok:false,error:"Private shared quota storage unavailable."},503);
 }
}
