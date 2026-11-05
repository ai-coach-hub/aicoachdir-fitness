import {createHmac,timingSafeEqual} from "node:crypto";
import {publicTrialReleaseGate} from "@/lib/publicIntroductoryTrialAdmission";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {productionTrialSql,reservePublicTrialTurn,storePublicTrialTurn,settlePublicTrialTurn} from "@/lib/publicIntroductoryTrialLedger";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"no-store"}});
type Input={version:1;audience:"aicoachdir-trial-hub";actor:"budgeting";action:"reserve"|"settle";email:string;clerk:string;requestKey:string;outcome:"completed"|"uncertain"|"released"|null;message:string;reply:string;issuedAt:number};
function canonical(v:Input){return "trial-budget-usage-v1\n"+JSON.stringify([v.version,v.audience,v.actor,v.action,v.email,v.clerk,v.requestKey,v.outcome,v.message,v.reply,v.issuedAt]);}
const emailOk=(v:string)=>v===v.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function valid(v:Input,now:number){
 return v.version===1&&v.audience==="aicoachdir-trial-hub"&&v.actor==="budgeting"&&
 ["reserve","settle"].includes(v.action)&&emailOk(v.email)&&
 /^user_[A-Za-z0-9_-]{8,128}$/.test(v.clerk)&&
 /^[A-Za-z0-9_-]{16,100}$/.test(v.requestKey)&&
 Number.isSafeInteger(v.issuedAt)&&Math.abs(v.issuedAt-now)<=30000&&
 typeof v.message==="string"&&v.message.length>0&&v.message.length<=6000&&
 typeof v.reply==="string"&&v.reply.length<=30000&&
 (v.action==="reserve"?v.outcome===null&&v.reply==="":
 ["completed","uncertain","released"].includes(String(v.outcome)));
}
function authenticated(v:Input,supplied:string){
 const secret=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"");
 if(secret.length<32||!/^[0-9a-f]{64}$/.test(supplied))return false;
 const expected=createHmac("sha256",secret).update(canonical(v)).digest("hex");
 return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex"));
}
export async function POST(request:Request){
 if(!publicTrialReleaseGate(process.env))return response({ok:false},404);
 if(Number(request.headers.get("content-length")||0)>45000)return response({ok:false},413);
 let v:Input;
 try{
  const raw:unknown=await request.json();
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return response({ok:false},400);
  v=raw as Input;
  if(!valid(v,Date.now())||!authenticated(v,request.headers.get("x-trial-usage-signature")||""))
   return response({ok:false},403);
 }catch{return response({ok:false},400);}
 const key=sharedUsageMemberKey(v.email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!key)return response({ok:false},403);
 const account={clerkId:v.clerk,memberKey:key};
 try{
  const sql=await productionTrialSql();
  const [grant,paid]=await Promise.all([
   sql`SELECT converted_at,completed_uses,reserved_uses FROM public.introductory_trial_grants
      WHERE clerk_user_id=${v.clerk} AND member_key=${key} LIMIT 2`,
   sql`SELECT 1 FROM public.fitness_memberships WHERE email=${v.email} LIMIT 2`
  ]);
  if(grant.length!==1)return response({ok:false,status:"not_entitled"},403);
  if(v.action==="reserve"){
   if(paid.length||grant[0].converted_at!=null)return response({ok:false,status:"converted"},403);
   const status=await reservePublicTrialTurn(account,"budgeting",v.requestKey);
   return response({ok:status==="reserved",status},status==="reserved"?200:status==="exhausted"?429:409);
  }
  if(v.outcome==="completed"){
   if(!v.reply.trim())return response({ok:false,status:"no_reply"},400);
   // Only a response verified as durably saved by the Budgeting service can
   // reach this signed path. The hub stores its own authoritative copy before
   // settling the one-time shared trial allowance.
   try{await storePublicTrialTurn(account,"budgeting",v.requestKey,v.message,v.reply);}
   catch{
    // Stripe-style retried settlement is idempotent: only the exact
    // previously saved response for this member, coach and request key
    // may continue to settle. A changed answer must not overwrite data.
    const prior=await sql`SELECT 1 FROM public.introductory_trial_history h
     JOIN public.introductory_trial_requests r
      ON r.clerk_user_id=h.clerk_user_id AND r.request_key=h.request_key
     WHERE h.clerk_user_id=${v.clerk} AND h.request_key=${v.requestKey}
      AND h.coach='budgeting' AND h.user_message=${v.message}
      AND h.coach_response=${v.reply} AND r.coach='budgeting'
      AND r.status IN ('reserved','completed') LIMIT 2`;
    if(prior.length!==1)return response({ok:false,status:"history_reconciliation_required"},503);
   }
  }
  const outcome=v.outcome==="completed"?"completed":v.outcome==="released"?"released":"uncertain";
  const status=await settlePublicTrialTurn(account,"budgeting",v.requestKey,outcome);
  return response({ok:status===outcome||status==="already_"+outcome,status},
    status===outcome||status==="already_"+outcome?200:409);
 }catch{return response({ok:false,status:"ledger_unavailable"},503);}
}
