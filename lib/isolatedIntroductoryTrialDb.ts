/**
 * PR #251 preview-only database adapter. Deliberately not wired into live routes.
 * The caller must independently verify Clerk identity, email ownership and
 * absence of paid/legacy billing BEFORE constructing a VerifiedTrialAccount.
 */
import {neon} from "@neondatabase/serverless";
import type {TrialPort,VerifiedTrialAccount,IntroCoach,IntroOutcome} from "./isolatedIntroductoryExecution";
const TRIAL_BRANCH="feature/intro-15-messages-isolated-20261101";
const NEON_BRANCH="br-spring-cloud-aui2mogd";
function assertIsolated():string{
 if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!==TRIAL_BRANCH||
    process.env.INTRODUCTORY_TRIAL_PREVIEW_ENABLED!=="true")
  throw Error("Introductory trial preview disabled");
 const url=process.env.INTRODUCTORY_TRIAL_DATABASE_URL||"";
 if(!url)throw Error("Isolated trial database is not configured");
 return url;
}
async function isolatedDb(){
 const sql=neon(assertIsolated());
 const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch`;
 if(String(rows[0]?.branch)!==NEON_BRANCH)throw Error("Introductory trial branch mismatch");
 return sql;
}
export const isolatedIntroductoryTrialPort:TrialPort={
 async grant(account:VerifiedTrialAccount){
  const sql=await isolatedDb();
  // Existing customers must be denied by verified membership checks upstream.
  if(!account.emailVerified||account.existingPaidOrLegacyMember)return "denied";
  if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(account.clerkUserId)||
     !/^member_[0-9a-f]{64}$/.test(account.memberKey))return "denied";
  const inserted=await sql`
   INSERT INTO public.introductory_trial_grants(clerk_user_id,member_key)
   VALUES(${account.clerkUserId},${account.memberKey})
   ON CONFLICT DO NOTHING RETURNING clerk_user_id`;
  if(inserted.length===1)return "granted";
  const existing=await sql`SELECT member_key FROM public.introductory_trial_grants
     WHERE clerk_user_id=${account.clerkUserId} LIMIT 1`;
  return existing.length===1&&String(existing[0].member_key)===account.memberKey?"existing":"denied";
 },
 async reserve(account:VerifiedTrialAccount,coach:IntroCoach,requestKey:string){
  const sql=await isolatedDb();
  const result=await sql`SELECT public.intro_trial_reserve(
   ${account.clerkUserId},${account.memberKey},${requestKey},${coach}) AS status`;
  return String(result[0]?.status||"unavailable");
 },
 async settle(account:VerifiedTrialAccount,coach:IntroCoach,requestKey:string,outcome:IntroOutcome){
  const sql=await isolatedDb();
  const result=await sql`SELECT public.intro_trial_settle(
   ${account.clerkUserId},${account.memberKey},${requestKey},${coach},${outcome}) AS status`;
  return String(result[0]?.status||"unavailable");
 }
};
