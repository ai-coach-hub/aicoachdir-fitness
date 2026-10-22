import {neon} from "@neondatabase/serverless";
import {sharedUsageMemberKey} from "./sharedUsageMemberIdentity";

const previewBranch="feature/life-coach-agent-sandbox-20261011";
const previewDatabaseBranch="br-autumn-breeze-auw38rgr";
function sharedSecret(){
 const value=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"").trim();
 if(value.length<32)throw Error("Private shared metering key is unavailable");
 return value;
}
async function bindingDb(){
 if(process.env.VERCEL_ENV!=="preview"||
    process.env.VERCEL_GIT_COMMIT_REF!==previewBranch||
    process.env.PREVIEW_SHARED_USAGE_METER_ENABLED!=="true")
   throw Error("Private shared member bindings disabled");
 const url=process.env.LIFE_COACH_DATABASE_URL;
 if(!url)throw Error("Private database unavailable");
 const sql=neon(url);
 const identity=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
 if(String(identity[0]?.branch_id||"")!==previewDatabaseBranch)
   throw Error("Private database identity mismatch");
 return sql;
}
// Called only after the allowlisted tester has completed Clerk authentication
// and explicitly enrolled in the existing preview meter.
export async function bindPrivatePreviewMember(clerkId:string,verifiedEmail:string){
 if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(clerkId))throw Error("Invalid tester ID");
 const key=sharedUsageMemberKey(verifiedEmail,sharedSecret());
 if(!key)throw Error("Verified tester email required");
 const sql=await bindingDb();
 await sql`INSERT INTO preview_ai_member_bindings (member_key,clerk_member_id)
 VALUES (${key},${clerkId}) ON CONFLICT (member_key) DO NOTHING`;
 const rows=await sql`SELECT clerk_member_id FROM preview_ai_member_bindings WHERE member_key=${key} LIMIT 1`;
 if(String(rows[0]?.clerk_member_id||"")!==clerkId)
   throw Error("Another tester is already bound to this email");
 return key;
}
// Called by the trusted Budgeting-to-hub service request. No Clerk/email data
// is accepted as an authoritative ID without an existing verified binding.
export async function resolvePrivatePreviewBudgetMember(email:string){
 const normalized=email.trim().toLowerCase();
 const testers=String(process.env.LIFE_COACH_TESTER_EMAILS||"")
   .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!testers.includes(normalized))return null;
 const key=sharedUsageMemberKey(normalized,sharedSecret());
 if(!key)return null;
 const sql=await bindingDb();
 const rows=await sql`SELECT clerk_member_id FROM preview_ai_member_bindings
 WHERE member_key=${key} LIMIT 1`;
 const member=String(rows[0]?.clerk_member_id||"");
 return /^user_[A-Za-z0-9_-]{8,128}$/.test(member)?member:null;
}
