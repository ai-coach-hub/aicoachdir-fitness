import {verifyBudgetSharedCall,type BudgetSharedCall} from "@/lib/privateBudgetUsageProtocol";
import {resolvePrivatePreviewBudgetMember} from "@/lib/previewSharedMemberBinding";
import {lifeTestStatus,previewTestAvailable,previewLifeTestPeriod,previewLifeTestSubscription} from "@/lib/previewLifeTestEnrollment";
import {reservePreviewAiUse,settlePreviewAiUse} from "@/lib/previewAiUsage";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>Response.json(data,{
 status,headers:{"Cache-Control":"private, no-store"}
});
// Authenticated service-to-service endpoint: Budgeting submits its verified
// signed-cookie member's email; the hub resolves ONLY pre-bound private testers.
// All quota accounting is one atomic shared Neon ledger, never Budgeting's DB.
// Production is disabled, and no provider/Stripe requests occur in this route.
export async function POST(request:Request){
 if(!previewTestAvailable())return json({ok:false,error:"Not available"},404);
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 const signature=request.headers.get("x-budget-shared-usage-signature")||"";
 let call:BudgetSharedCall;
 try {call=await request.json() as BudgetSharedCall;}
 catch {return json({ok:false,error:"Invalid request"},400);}
 if(!verifyBudgetSharedCall(call,signature,secret,Math.floor(Date.now()/1000)))
   return json({ok:false,error:"Service authorization failed"},401);
 try {
  const member=await resolvePrivatePreviewBudgetMember(call.email);
  if(!member)return json({ok:false,error:"Private tester binding required"},403);
  const enrollment=await lifeTestStatus(member);
  if(!enrollment.active)return json({ok:false,error:"Private enrollment required"},403);
  const usage={memberId:member,subscriptionKey:previewLifeTestSubscription,
   periodStart:previewLifeTestPeriod,requestKey:call.requestKey,coach:"budgeting" as const};
  const status=call.action==="reserve"
    ? await reservePreviewAiUse(usage)
    : await settlePreviewAiUse(usage,call.outcome!);
  if(call.action==="reserve"&&status!=="reserved")
    return json({ok:false,status,error:status==="exhausted"?"Private allowance reached":
      "Request is not eligible"},status==="exhausted"?429:409);
  if(call.action==="settle"&&
     !["completed","released","uncertain","already_completed","already_released","already_uncertain"].includes(status))
    return json({ok:false,status,error:"Unable to settle request"},409);
  return json({ok:true,status,mode:"private-shared-ledger"});
 }catch {
  return json({ok:false,error:"Private shared meter unavailable"},503);
 }
}
