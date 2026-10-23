import {membershipDb} from "./fitnessMembershipDb";

/**
 * Conversation persistence for additional AI coaches.
 * NEW coach routes must obtain memberId from the server's verified Clerk
 * session and authenticate access through memberHasFitnessAccess first.
 * No existing coach conversations are imported, moved or deleted.
 */
const coachAllowed=(id:string)=>/^[a-z][a-z0-9_-]{2,40}$/.test(id);
const memberAllowed=(id:string)=>/^user_[A-Za-z0-9_-]{8,128}$/.test(id);
const threadAllowed=(id:string)=>/^thread_[A-Za-z0-9_-]{8,100}$/.test(id);
const requestAllowed=(id:string)=>/^[A-Za-z0-9_-]{16,100}$/.test(id);

async function checkedConversationDb(){
 const sql=membershipDb();
 if(process.env.VERCEL_ENV==="preview" || process.env.VERCEL_ENV==="production"){
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
  const current=String(rows[0]?.branch_id||"");
  const expected=process.env.VERCEL_ENV==="production"
   ?"br-sparkling-glitter-aucpz59d":"br-autumn-breeze-auw38rgr";
  if(current!==expected)throw Error("Coach conversation database branch mismatch");
  // The preview membership DB is isolated only on the historical private
  // Life Coach branch. Other previews must not write against live data.
  if(process.env.VERCEL_ENV==="preview" &&
    process.env.VERCEL_GIT_COMMIT_REF!=="feature/life-coach-agent-sandbox-20261011")
   throw Error("Coach conversation preview database branch mismatch");
 }
 return sql;
}

export async function saveCoachConversationTurn(input:{
 coach:string;memberId:string;threadId:string;requestKey:string;
 message:string;response:string;
}):Promise<string>{
 const {coach,memberId,threadId,requestKey,message,response}=input;
 if(!coachAllowed(coach)||!memberAllowed(memberId)||
  !threadAllowed(threadId)||!requestAllowed(requestKey)||
  typeof message!=="string"||!message.length||message.length>12000||
  typeof response!=="string"||!response.length||response.length>24000)
  return "invalid";
 const sql=await checkedConversationDb();
 const rows=await sql`SELECT public.coach_conversation_save(
  ${coach},${memberId},${threadId},${requestKey},${message},${response}
 ) AS result`;
 return String(rows[0]?.result||"unavailable");
}

export async function listCoachConversationThreads(
 coach:string,memberId:string
){
 if(!coachAllowed(coach)||!memberAllowed(memberId))return [];
 const sql=await checkedConversationDb();
 return await sql`SELECT thread_id,created_at,updated_at
  FROM public.coach_conversation_threads
  WHERE coach_key=${coach} AND member_id=${memberId}
  ORDER BY updated_at DESC LIMIT 100`;
}

export async function readCoachConversationThread(
 coach:string,memberId:string,threadId:string
){
 if(!coachAllowed(coach)||!memberAllowed(memberId)||!threadAllowed(threadId))
  return [];
 const sql=await checkedConversationDb();
 return await sql`SELECT request_key,user_text,assistant_text,created_at
  FROM public.coach_conversation_turns
  WHERE coach_key=${coach} AND member_id=${memberId}
    AND thread_id=${threadId}
  ORDER BY turn_index ASC LIMIT 500`;
}
