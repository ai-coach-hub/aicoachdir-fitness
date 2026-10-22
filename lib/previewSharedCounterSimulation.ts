import {runMeteredPreviewGeneration} from "./previewLifeUsageFlow";
import {reservePreviewAiUse,settlePreviewAiUse,type AiUsageCoach} from "./previewAiUsage";
import {previewLifeTestPeriod,previewLifeTestSubscription} from "./previewLifeTestEnrollment";

// Synthetic counter QA only: never calls Fitness, Budgeting, Life or Pickaxe.
// Uses the same atomic preview ledger and one allowance family for every coach.
export async function simulateSharedPreviewUse(args:{
 memberId:string;coach:AiUsageCoach;requestKey:string;
}) {
 if (!["fitness","budgeting","life"].includes(args.coach))
  return {status:"invalid" as const};
 if (!/^[A-Za-z0-9_-]{16,100}$/.test(args.requestKey))
  return {status:"invalid" as const};
 const entry={
  memberId:args.memberId,
  subscriptionKey:previewLifeTestSubscription,
  periodStart:previewLifeTestPeriod,
  requestKey:args.requestKey,
  coach:args.coach
 };
 return runMeteredPreviewGeneration({
  reserve:()=>reservePreviewAiUse(entry),
  settle:outcome=>settlePreviewAiUse(entry,outcome)
 },async()=>({kind:"generated" as const,value:{
  simulated:true as const,coach:args.coach,
  message:"Synthetic shared-usage reservation completed. No AI model was called."
 }}));
}
