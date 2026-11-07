/**
 * Verified readback of the EXISTING native storage tables on the isolated
 * PR #251 Neon branch. Does not insert seed records, change usage, checkout,
 * or call any model. A converted test account remains eligible to inspect
 * its own records; only the dedicated Clerk tester may use this route.
 */
import {currentUser} from "@clerk/nextjs/server";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {introHistorySql} from "@/lib/isolatedTrialHistory";

export type NativeReadbackResult={
  ok:true;mode:"isolated-preview";trial:{fitness:number;budgeting:number;life:number};
  paidContinuation:{recordedTurns:number;converted:boolean;linkedTestMembership:boolean};
  native:{fitnessPlan:boolean;budgetMonths:number;budgetChatTurns:number;lifeGoalStatements:number};
};
export async function readPrivateNativeReadback():Promise<NativeReadbackResult|null>{
 if(!isolatedTrialPreviewEnabled())return null;
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||!primary||primary.verification?.status!=="verified"||
   user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||""))
  return null;
 const email=primary.emailAddress.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
 // This ensures the isolated branch matches br-spring-cloud-aui2mogd and
 // the request uses only the preconfigured test DATABASE URL.
 const sql=await introHistorySql();
 const [trial,paid,grant,member,fitness,budget,budgetChat,goals]=await Promise.all([
   sql`SELECT h.coach,COUNT(*)::integer AS count
       FROM public.introductory_trial_history h
       JOIN public.introductory_trial_requests r
        ON r.clerk_user_id=h.clerk_user_id AND r.request_key=h.request_key
       WHERE h.clerk_user_id=${user.id} AND r.status='completed'
       GROUP BY h.coach`,
   sql`SELECT COUNT(*)::integer AS count FROM public.introductory_paid_history
       WHERE clerk_user_id=${user.id}`,
   sql`SELECT converted_at FROM public.introductory_trial_grants
       WHERE clerk_user_id=${user.id} LIMIT 2`,
   sql`SELECT 1 FROM public.fitness_memberships
       WHERE clerk_user_id=${user.id} AND email=${email}
        AND access_active=true AND stripe_subscription_id IS NOT NULL LIMIT 2`,
   sql`SELECT 1 FROM public.workout_plan_cache WHERE email=${email}
       AND plan_json IS NOT NULL LIMIT 1`,
   sql`SELECT COUNT(*)::integer AS count FROM public.budget_member_months
       WHERE member_email=${email}`,
   sql`SELECT COUNT(*)::integer AS count FROM public.budget_chat_messages
       WHERE member_email=${email} AND role='assistant'`,
   sql`SELECT COUNT(*)::integer AS count FROM public.life_chat_messages
       WHERE member_id=${user.id} AND role='user'
        AND (lower(body) LIKE '%my goal%' OR lower(body) LIKE '%my priority%'
          OR lower(body) LIKE '%i want to%' OR lower(body) LIKE '%i plan to%')`
 ]);
 const counts={fitness:0,budgeting:0,life:0};
 for(const row of trial){
   const coach=String(row.coach);
   if(coach==="fitness"||coach==="budgeting"||coach==="life")
    counts[coach]=Number(row.count);
 }
 return {
  ok:true,mode:"isolated-preview",trial:counts,
  paidContinuation:{
    recordedTurns:Number(paid[0]?.count||0),
    converted:grant.length===1&&grant[0].converted_at!=null,
    linkedTestMembership:member.length===1
  },
  native:{
    fitnessPlan:fitness.length===1,
    budgetMonths:Number(budget[0]?.count||0),
    budgetChatTurns:Number(budgetChat[0]?.count||0),
    lifeGoalStatements:Number(goals[0]?.count||0)
  }
 };
}
