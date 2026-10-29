import { NextResponse } from "next/server";
import { membershipDb } from "@/lib/fitnessMembershipDb";
export const dynamic = "force-dynamic";
export async function GET() {
 if (process.env.VERCEL_ENV !== "preview" ||
 process.env.VERCEL_GIT_COMMIT_REF !== "feature/verified-subscription-upgrade-policy-20261027")
 return new NextResponse(null,{status:404});
 try {
  const sql=membershipDb();
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
  if(String(rows[0]?.branch_id)!=="br-young-salad-aubnf7xt")
   return NextResponse.json({status:"incorrect_branch"},{status:503});
  return NextResponse.json({status:"ready"});
 }catch(e){
  console.error("[upgrade-qa-db-health]",e instanceof Error?e.name:"unknown_error");
  return NextResponse.json({status:"database_unavailable"},{status:503});
 }
}