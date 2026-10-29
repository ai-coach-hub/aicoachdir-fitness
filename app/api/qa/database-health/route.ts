import { NextResponse } from "next/server";
import { membershipDb } from "@/lib/fitnessMembershipDb";
export const dynamic="force-dynamic";
export async function GET() {
 if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027")
  return new NextResponse(null,{status:404});
 const configured=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 if(!configured)return NextResponse.json({status:"missing_configuration"},{status:503});
 if(!/^postgres(ql)?:\/\//i.test(configured))return NextResponse.json({status:"invalid_configuration"},{status:503});
 try {
  const sql=membershipDb();
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
  if(String(rows[0]?.branch_id)!=="br-young-salad-aubnf7xt")
   return NextResponse.json({status:"incorrect_branch"},{status:503});
  return NextResponse.json({status:"ready"});
 }catch(e) {
  const message=e instanceof Error?e.message:"";
  const status=/password|authentication|unauthorized|28P01|permission denied/i.test(message)?"authentication_failed":
   /fetch failed|ENOTFOUND|ECONN|timeout|network|connection/i.test(message)?"connection_failed":"database_query_failed";
  console.error("[upgrade-qa-db-health]",{status});
  return NextResponse.json({status},{status:503});
 }
}