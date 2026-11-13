import {verifyTrialBudgetAttestation} from "@/lib/publicTrialBudgetSigning";
import {productionTrialSql} from "@/lib/publicIntroductoryTrialLedger";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {isPublicTrialPreflightAvailable} from "@/lib/publicIntroductoryTrialPreflight";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(obj:unknown,status=200)=>Response.json(obj,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!isPublicTrialPreflightAvailable())return response({ok:false},404);
 if(Number(request.headers.get("content-length")||0)>2000)return response({ok:false},413);
 let input:Record<string,unknown>;
 try{const raw=await request.json();if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid");
  input=raw as Record<string,unknown>;
 }catch{return response({ok:false},400);}
 const email=String(input.email||""),clerk=String(input.clerk||""),issued=String(input.issued||"");
 if(!verifyTrialBudgetAttestation(email,clerk,issued,String(request.headers.get("x-trial-budget-signature")||"")))
  return response({ok:false},403);
 const key=sharedUsageMemberKey(email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!key)return response({ok:false},403);
 try{
  const sql=await productionTrialSql();
  const [grants,members]=await Promise.all([
   sql`SELECT completed_uses,reserved_uses,message_limit,converted_at
    FROM public.introductory_trial_grants WHERE clerk_user_id=${clerk} AND member_key=${key} LIMIT 2`,
   sql`SELECT 1 FROM public.fitness_memberships WHERE email=${email} LIMIT 2`
  ]);
  if(members.length||grants.length!==1||grants[0].converted_at!=null)return response({ok:false},403);
  const remaining=Number(grants[0].message_limit)-Number(grants[0].completed_uses)-Number(grants[0].reserved_uses);
  if(!Number.isInteger(remaining)||remaining<0||remaining>15)return response({ok:false},403);
  return response({ok:true,active:true,remaining,clerk,memberKey:key,email});
 }catch{return response({ok:false},503);}
}
