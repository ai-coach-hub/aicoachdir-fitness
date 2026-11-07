/**
 * Trial data stays under the same verified Clerk identity during conversion.
 * Only this dedicated Neon branch is ever accessed. No customer data copied.
 */
import {neon} from "@neondatabase/serverless";
const BRANCH="feature/intro-15-messages-isolated-20261101";
const NEON="br-spring-cloud-aui2mogd";
export async function introHistorySql(){
 if(process.env.VERCEL_ENV!=="preview"||
   process.env.VERCEL_GIT_COMMIT_REF!==BRANCH||
   process.env.INTRODUCTORY_TRIAL_PREVIEW_ENABLED!=="true")throw Error("Trial disabled");
 const url=process.env.INTRODUCTORY_TRIAL_DATABASE_URL;
 if(!url)throw Error("Trial storage unavailable");
 const sql=neon(url);
 const rows=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(String(rows[0]?.id)!==NEON)throw Error("Trial branch mismatch");
 return sql;
}
export async function saveTrialTurn(accountId:string,requestKey:string,coach:string,prompt:string,response:string){
 const sql=await introHistorySql();
 const rows=await sql`INSERT INTO public.introductory_trial_history
 (clerk_user_id,request_key,coach,user_message,coach_response)
 SELECT ${accountId},${requestKey},${coach},${prompt},${response}
 WHERE EXISTS(
 SELECT 1 FROM public.introductory_trial_requests WHERE
 clerk_user_id=${accountId} AND request_key=${requestKey}
 AND coach=${coach} AND status='reserved'
 ) ON CONFLICT(clerk_user_id,request_key) DO NOTHING RETURNING request_key`;
 if(rows.length!==1)throw Error("Trial history not persisted");
}
export async function readTrialTurns(accountId:string){
 const sql=await introHistorySql();
 return sql`SELECT h.coach,h.user_message,h.coach_response,h.created_at FROM
 public.introductory_trial_history h JOIN public.introductory_trial_requests r
 ON r.clerk_user_id=h.clerk_user_id AND r.request_key=h.request_key
 WHERE h.clerk_user_id=${accountId} AND r.status='completed'
 ORDER BY h.created_at ASC,h.request_key ASC LIMIT 100`;
}
