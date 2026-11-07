/**
 * Read only completed post-conversion paid turns on the isolated Neon branch.
 * Caller independently authenticates the signed-in Clerk identity.
 */
import {introHistorySql} from "@/lib/isolatedTrialHistory";
export async function readIsolatedPaidTurns(clerkId:string){
 const sql=await introHistorySql();
 return sql`SELECT h.coach,h.user_message,h.coach_response,h.created_at
 FROM public.introductory_paid_history h
 JOIN public.shared_ai_usage_requests r
  ON r.member_key=h.member_key AND r.entitlement_key=h.entitlement_key
  AND r.period_start=h.period_start AND r.request_key=h.request_key
 WHERE h.clerk_user_id=${clerkId} AND r.status='completed'
 ORDER BY h.created_at ASC,h.request_key ASC LIMIT 200`;
}
