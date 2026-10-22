import {lifeTester} from "@/lib/lifeCoachAccess";
import {lifeTestStatus,previewTestAvailable} from "@/lib/previewLifeTestEnrollment";
import {simulateSharedPreviewUse} from "@/lib/previewSharedCounterSimulation";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});

// Private simulation only. No provider, Stripe, actual coach or user message input.
export async function POST(request:Request) {
 if(!previewTestAvailable())
  return reply({ok:false,error:"Private QA unavailable."},404);
 const member=await lifeTester();
 if(!member)return reply({ok:false,error:"Private tester required."},403);
 let body:Record<string,unknown>;
 try {body=await request.json();}catch{
  return reply({ok:false,error:"Invalid test request."},400);
 }
 if(!body || typeof body!=="object" || Array.isArray(body) ||
   !["fitness","budgeting","life"].includes(String(body.coach)) ||
   typeof body.requestKey!=="string" ||
   !/^[A-Za-z0-9_-]{16,100}$/.test(body.requestKey))
  return reply({ok:false,error:"Invalid synthetic test fields."},400);
 try {
  const enrolled=await lifeTestStatus(member);
  if(!enrolled.active)return reply({ok:false,error:"Private QA enrollment required."},403);
  const result=await simulateSharedPreviewUse({
   memberId:member,coach:body.coach as "fitness"|"budgeting"|"life",
   requestKey:body.requestKey
  });
  if(result.status==="completed")
   return reply({ok:true,mode:"synthetic-only",...result.value});
  if(result.status==="blocked")
   return reply({ok:false,error:result.reason},result.reason==="exhausted"?429:409);
  return reply({ok:false,error:"Private usage outcome needs reconciliation."},503);
 }catch {
  return reply({ok:false,error:"Private usage test unavailable."},503);
 }
}
