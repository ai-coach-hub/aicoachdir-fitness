import {verifyBudgetUsageCommand,type BudgetUsageCommand} from "@/lib/budgetUsageServiceAuth";
import {getFitnessMembership} from "@/lib/fitnessMembershipDb";
import {previewTestAvailable,lifeTestStatus,previewLifeTestPeriod,previewLifeTestSubscription} from "@/lib/previewLifeTestEnrollment";
import {reservePreviewAiUse,settlePreviewAiUse} from "@/lib/previewAiUsage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});

// Private cross-application proof: server-authenticated Budgeting chat requests
// reserve/settle in the ACTUAL shared Neon preview ledger. No Pickaxe or live
// Stripe calls are made in this route. It cannot run in production.
export async function POST(request:Request){
 if(!previewTestAvailable())return reply({ok:false,error:"Private bridge unavailable."},404);
 let body:unknown;
 try{body=await request.json();}catch{return reply({ok:false,error:"Invalid command."},400);}
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 const signature=request.headers.get("x-budget-usage-signature")||"";
 if(!verifyBudgetUsageCommand(body,signature,secret,Math.floor(Date.now()/1000)))
  return reply({ok:false,error:"Service authentication required."},401);
 const cmd=body as BudgetUsageCommand;
 const testers=String(process.env.LIFE_COACH_TESTER_EMAILS||"")
   .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!testers.includes(cmd.email))
  return reply({ok:false,error:"Private tester not enrolled."},403);
 try {
  const member=await getFitnessMembership(cmd.email);
  // The hub does not accept a user ID from Budgeting; it resolves the existing
  // Clerk ID from its own member database on the isolated preview branch.
  if(!member||member.access_active!==true||
     !/^user_[A-Za-z0-9_-]{8,128}$/.test(String(member.clerk_user_id||""))||
     !["active","trialing","legacy_pickaxe_member"].includes(String(member.stripe_status||"")))
   return reply({ok:false,error:"Active verified tester membership required."},403);
  const memberId=String(member.clerk_user_id);
  const status=await lifeTestStatus(memberId);
  if(!status.active)return reply({ok:false,error:"Preview allowance enrollment required."},403);
  const usage={
   memberId,subscriptionKey:previewLifeTestSubscription,
   periodStart:previewLifeTestPeriod,requestKey:cmd.requestKey,
   coach:"budgeting" as const
  };
  const result=cmd.operation==="reserve"
   ? await reservePreviewAiUse(usage)
   : await settlePreviewAiUse(usage,cmd.outcome!);
  // No private member fields or secrets are returned or logged.
  return reply({ok:result==="reserved"||["completed","released","uncertain"].includes(result),
   status:result,mode:"private-shared-usage"});
 } catch {
  return reply({ok:false,error:"Private shared usage service unavailable."},503);
 }
}
