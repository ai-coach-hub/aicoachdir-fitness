import {verifySharedUsageServiceRequest,type SharedUsageServiceRequest} from "@/lib/shared-usage-service";
import {sharedUsageGateEnabled,reserveSharedUsage,settleSharedUsage} from "@/lib/sharedUsageMeter";
import {resolvePrivatePreviewBudgetMember} from "@/lib/previewSharedMemberBinding";
import {lifeTestStatus,previewTestAvailable,previewLifeTestPeriod,previewLifeTestSubscription} from "@/lib/previewLifeTestEnrollment";
import {reservePreviewAiUse,settlePreviewAiUse} from "@/lib/previewAiUsage";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});

// Signed Budgeting-to-hub shared-wallet authority. Preview uses the separate
// synthetic Neon ledger; real metering requires both production release flags.
// Deploying this code does not turn on either flag or migrate customer balances.
export async function POST(request:Request){
 const live=process.env.VERCEL_ENV==="production"&&sharedUsageGateEnabled();
 if(!live&&!previewTestAvailable())
  return reply({ok:false,error:"Shared usage bridge is not yet released."},404);
 let command:SharedUsageServiceRequest;
 try{command=await request.json();}catch{
  return reply({ok:false,error:"Invalid usage command."},400);
 }
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 if(!verifySharedUsageServiceRequest(command,
  request.headers.get("x-shared-usage-signature")||"",secret,Date.now()))
  return reply({ok:false,error:"Invalid usage service authentication."},401);
 if(live){
  try{
   // Only the server-verified membership/Stripe period can select a wallet.
   // The caller may submit an HMAC-signed email and stable request ID, never
   // a client-supplied subscription, usage count, price or billing period.
   const result=command.action==="reserve"
    ?(await reserveSharedUsage(command.memberEmail,"budgeting",command.requestKey)).status
    :await settleSharedUsage(command.memberEmail,"budgeting",command.requestKey,command.outcome!);
   const accepted=command.action==="reserve" ? result==="reserved" :
    result===command.outcome||result==="already_"+command.outcome;
   // Explicit 409 informs the trusted Budgeting server that a verified
   // existing member must remain on the old provider until next renewal.
   // Unknown/ineligible members never receive this safe legacy fallback.
   const status=accepted?200:result==="exhausted"?429:
    result==="pending_renewal"?409:
    result.startsWith("duplicate_")?409:result==="not_entitled"?403:503;
   return reply({ok:accepted,result,mode:"shared-wallet"},status);
  }catch{
   // Never fall back to unlimited Budgeting AI when billing or ledger fails.
   return reply({ok:false,error:"Shared usage ledger unavailable."},503);
  }
 }
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
