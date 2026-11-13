/**
 * Read-only dedicated trial access diagnostic. No completions, Action calls,
 * access writes, wallet changes, production database or user data in output.
 */
import { currentUser } from "@clerk/nextjs/server";
import { isolatedTrialPreviewEnabled } from "@/lib/isolatedIntroductoryIdentity";
import { verifiedIsolatedPaidContinuation } from "@/lib/isolatedPaidContinuation";
import { introHistorySql } from "@/lib/isolatedTrialHistory";
import { FITNESS_ACCESS_GROUP_ID } from "@/lib/pickaxeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = "https://api.pickaxe.co/v1";
const reply = (payload: unknown, status = 200) => Response.json(payload, {
  status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
});
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const unwrap = (v: unknown) => {
 const r = object(v);
 return r.data && typeof r.data === "object" && !Array.isArray(r.data) ? object(r.data) : r;
};
function exactGroupFound(v: unknown, target: string, depth = 0): boolean {
 if (depth > 8) return false;
 if (v === target) return true;
 if (Array.isArray(v)) return v.some(x => exactGroupFound(x,target,depth+1));
 if (!v || typeof v !== "object") return false;
 return Object.values(object(v)).some(x => exactGroupFound(x,target,depth+1));
}
async function studio(path: string, token: string) {
 return fetch(BASE+path,{headers:{
  Authorization:`Bearer ${token}`, Accept:"application/json"
 },cache:"no-store",signal:AbortSignal.timeout(12000)});
}
export async function GET() {
 if (!isolatedTrialPreviewEnabled()) return reply({ok:false,error:"Unavailable"},404);
 const user = await currentUser();
 const primary = user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if (!user || !primary || primary.verification?.status!=="verified" ||
     user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||""))
  return reply({ok:false,error:"Dedicated test identity required"},403);
 const email = primary.emailAddress.trim().toLowerCase();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return reply({ok:false,error:"Test email invalid"},403);
 const paid = await verifiedIsolatedPaidContinuation();
 if (!paid.ready || paid.clerkId!==user.id)
  return reply({ok:false,error:"Existing converted test membership could not be verified"},403);
 try {
  const sql=await introHistorySql();
  const rows=await sql`SELECT request_key,status FROM public.shared_ai_usage_requests
   WHERE coach='fitness' AND request_key IN
   ('native-fitness-save-qa-20261107','native-fitness-post-registration-qa-20261110') LIMIT 3`;
  const old=rows.filter(r=>r.request_key==="native-fitness-save-qa-20261107");
  const newer=rows.filter(r=>r.request_key==="native-fitness-post-registration-qa-20261110");
  const token=String(process.env.PICKAXE_WORKSPACE_API_TOKEN||"").trim();
  const deployment=String(process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID||"").trim();
  if (!token || !deployment) return reply({ok:false,error:"Required Studio configuration missing"},503);
  const [userResponse,groupResponse,deployResponse]=await Promise.all([
   studio("/studio/user/"+encodeURIComponent(email),token),
   studio("/studio/access-group/"+encodeURIComponent(FITNESS_ACCESS_GROUP_ID),token),
   studio("/studio/deployment/list",token)
  ]);
  if (!userResponse.ok || !groupResponse.ok || !deployResponse.ok) return reply({
    ok:false,readOnly:true,error:"Studio metadata lookup unavailable",
    userLookupStatus:userResponse.status,groupLookupStatus:groupResponse.status,
    deploymentLookupStatus:deployResponse.status
  },503);
  const userRecord=unwrap(await userResponse.json());
  if (String(userRecord.email||"").trim().toLowerCase()!==email)
   return reply({ok:false,readOnly:true,error:"Studio identity mismatch"},409);
  const groupRecord=unwrap(await groupResponse.json());
  const deploymentPayload=object(await deployResponse.json());
  const deployments=Array.isArray(deploymentPayload.data)?deploymentPayload.data:[];
  const matching=deployments.filter(x=>object(x).deploymentId===deployment);
  const assigned=exactGroupFound(userRecord,FITNESS_ACCESS_GROUP_ID);
  const knownGroup=exactGroupFound(groupRecord,FITNESS_ACCESS_GROUP_ID);
  return reply({
   ok:true,mode:"isolated-preview",readOnly:true,
   studioUserVerified:true,fitnessAccessGroupExists:knownGroup,
   fitnessAccessGroupAssigned:assigned,
   deploymentFound:matching.length===1,
   deploymentIsApi:matching.length===1&&object(matching[0]).type==="api",
   initialAttemptStatus:old.length===1?String(old[0].status):"missing_or_ambiguous",
   latestAttemptStatus:newer.length===1?String(newer[0].status):"missing_or_ambiguous",
   modelRequestsSent:0,memberAccessChanges:0,
   note:assigned?"Membership assignment detected; provider HTTP 500 still needs diagnosis":
    "Required Fitness access group is not present in the Studio user record; a missing assignment may cause completions to fail."
  });
 }catch{
  return reply({ok:false,readOnly:true,error:"Read-only metadata diagnostic unavailable"},503);
 }
}
