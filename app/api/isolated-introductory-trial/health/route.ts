import {neon} from "@neondatabase/serverless";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const expected="br-spring-cloud-aui2mogd";
export async function GET(){
 if(process.env.VERCEL_ENV!=="preview"||
    process.env.VERCEL_GIT_COMMIT_REF!=="feature/intro-15-messages-isolated-20261101")
  return Response.json({ok:false},{status:404});
 try{
  // Read-only runtime verification of the exact configured trial database.
  // Never return connection details or customer records.
  const url=process.env.INTRODUCTORY_TRIAL_DATABASE_URL;
  if(!url)return Response.json({ok:false,isolated:false},{status:503});
  const sql=neon(url);
  const rows=await sql`SELECT current_setting('neon.branch_id',true) AS branch`;
  const isolated=String(rows[0]?.branch)==expected;
  return Response.json({ok:isolated,isolated},{status:isolated?200:503,headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ok:false,isolated:false},{status:503});}
}
