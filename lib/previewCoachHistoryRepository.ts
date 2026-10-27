import "server-only";
import { neon } from "@neondatabase/serverless";
import type { CoachHistoryIdentity } from "./newCoachHistoryPort.mjs";

/** Future coach storage; intentionally disabled except an isolated QA branch. */
export function previewCoachHistoryRepository() {
 if(process.env.VERCEL_ENV!=="preview" ||
    process.env.VERCEL_GIT_COMMIT_REF!=="feature/reusable-coach-launch-foundation-20261026" ||
    process.env.PREVIEW_COACH_HISTORY_ENABLED!=="true") {
   throw Error("Coach history preview is disabled");
 }
 const url=String(process.env.COACH_HISTORY_PREVIEW_DATABASE_URL||"");
 if(!url)throw Error("Isolated preview database not configured");
 const sql=neon(url);
 const expected=String(process.env.COACH_HISTORY_PREVIEW_BRANCH_ID||"");
 if(!/^br-[a-z0-9-]+$/.test(expected))throw Error("Preview branch identity missing");
 async function verifiedDb(){
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
  if(String(rows[0]?.id||"")!==expected)throw Error("Preview database branch mismatch");
  return sql;
 }
 return {
  async read(key:CoachHistoryIdentity){
   const db=await verifiedDb();
   const rows=await db`SELECT question,reply,created_at FROM public.coach_chat_turns
    WHERE coach=${key.coach} AND member_id=${key.memberId} AND thread_id=${key.threadId}
    ORDER BY created_at ASC,request_key ASC LIMIT 100`;
   return rows.map(row=>({question:String(row.question),reply:String(row.reply),
    createdAt:String(row.created_at)}));
  },
  async save(row:CoachHistoryIdentity&{requestKey:string;question:string;reply:string}){
   const db=await verifiedDb();
   // One statement: insert once; repeat delivery must have identical contents.
   const result=await db`WITH attempt AS (
    INSERT INTO public.coach_chat_turns(coach,member_id,thread_id,request_key,question,reply)
    VALUES (${row.coach},${row.memberId},${row.threadId},${row.requestKey},${row.question},${row.reply})
    ON CONFLICT (coach,member_id,thread_id,request_key) DO NOTHING
    RETURNING 1 AS inserted
   )
   SELECT CASE
    WHEN EXISTS(SELECT 1 FROM attempt) THEN 'saved'
    WHEN EXISTS(SELECT 1 FROM public.coach_chat_turns WHERE
      coach=${row.coach} AND member_id=${row.memberId} AND
      thread_id=${row.threadId} AND request_key=${row.requestKey} AND
      question=${row.question} AND reply=${row.reply}) THEN 'already_saved'
    ELSE 'conflict' END AS result`;
   return String(result[0]?.result||"unavailable");
  }
 };
}
