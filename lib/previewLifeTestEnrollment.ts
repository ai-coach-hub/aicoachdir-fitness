import { neon } from "@neondatabase/serverless";
const branch="feature/life-coach-agent-sandbox-20261011";
const expected="br-autumn-breeze-auw38rgr";
export const previewLifeTestPeriod="2026-10-19T00:00:00.000Z";
export const previewLifeTestSubscription="preview-life-three-use-20261019";
export const previewLifeTestLimit=3;
function permitted(){
 return process.env.VERCEL_ENV==="preview" &&
  process.env.VERCEL_GIT_COMMIT_REF===branch &&
  process.env.PREVIEW_SHARED_USAGE_METER_ENABLED==="true";
}
export function previewTestAvailable(){return permitted();}
async function database(){
 if(!permitted())throw Error("Preview-only test is disabled");
 const url=process.env.LIFE_COACH_DATABASE_URL;
 if(!url)throw Error("Preview database is missing");
 const sql=neon(url);
 const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
 if(String(rows[0]?.branch_id||"")!==expected)throw Error("Unexpected database branch");
 return sql;
}
export async function lifeTestStatus(member:string){
 const sql=await database();
 const rows=await sql`SELECT limit_uses,reserved_uses,completed_uses FROM preview_ai_usage_periods
 WHERE member_id=${member} AND subscription_key=${previewLifeTestSubscription}
 AND period_start=${previewLifeTestPeriod}::timestamptz AND period_end>NOW()`;
 const row=rows[0];
 if(!row)return {active:false,remaining:0,used:0,limit:previewLifeTestLimit};
 return {active:true,remaining:Number(row.limit_uses)-Number(row.reserved_uses)-Number(row.completed_uses),
  used:Number(row.completed_uses),limit:Number(row.limit_uses)};
}
export async function enrollLifeTest(member:string){
 const sql=await database();
 await sql`INSERT INTO preview_ai_usage_periods
   (member_id,subscription_key,period_start,period_end,limit_uses)
 VALUES (${member},${previewLifeTestSubscription},${previewLifeTestPeriod}::timestamptz,
         '2026-11-01T00:00:00Z'::timestamptz,${previewLifeTestLimit})
 ON CONFLICT (member_id,subscription_key,period_start) DO NOTHING`;
 return lifeTestStatus(member);
}
