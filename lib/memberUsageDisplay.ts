import {membershipDb} from "./fitnessMembershipDb";
import {resolveCurrentSharedUsage} from "./sharedUsageMeter";
import {verifiedLifeLaunchPermit} from "./lifeLaunchAllowance";

// Read-only member counters. Do not infer a fresh 400 uses for an
// unreconciled pre-cutover Pickaxe cycle.
export type MemberUsageDisplay =
 | {kind:"shared";limit:number;used:number;pending:number;remaining:number;renewal:string}
 | {kind:"launch";limit:number;used:number;pending:number;remaining:number;renewal:string}
 | {kind:"unavailable"};

export function validatedUsageCounts(row:Record<string,unknown>|undefined,limit:number){
 const completed=Number(row?.completed_uses??0);
 const pending=Number(row?.reserved_uses??0);
 if(!Number.isSafeInteger(completed)||!Number.isSafeInteger(pending)||
    completed<0||pending<0||completed+pending>limit)return null;
 return {used:completed,pending,remaining:limit-completed-pending};
}
export async function memberUsageDisplay(email:string):Promise<MemberUsageDisplay>{
 if(process.env.VERCEL_ENV!=="production")return {kind:"unavailable"};
 try{
  const shared=await resolveCurrentSharedUsage(email);
  if(shared){
   const db=membershipDb();
   const branch=await db`SELECT current_setting('neon.branch_id',true) AS branch`;
   if(String(branch[0]?.branch)!=="br-sparkling-glitter-aucpz59d")return {kind:"unavailable"};
   const rows=await db`SELECT completed_uses,reserved_uses,limit_uses,period_end
      FROM public.shared_ai_usage_periods
      WHERE member_key=${shared.memberKey} AND entitlement_key=${shared.entitlementKey}
      AND period_start=${shared.periodStart}::timestamptz LIMIT 1`;
   if(rows.length && (Number(rows[0].limit_uses)!==shared.limitUses ||
     new Date(String(rows[0].period_end)).toISOString()!==shared.periodEnd))return {kind:"unavailable"};
   const counts=validatedUsageCounts(rows[0],shared.limitUses);
   return counts?{kind:"shared",limit:shared.limitUses,...counts,renewal:shared.periodEnd}:{kind:"unavailable"};
  }
  const launch=await verifiedLifeLaunchPermit(email);
  if(!launch)return {kind:"unavailable"};
  const db=membershipDb();
  const branch=await db`SELECT current_setting('neon.branch_id',true) AS branch`;
  if(String(branch[0]?.branch)!=="br-sparkling-glitter-aucpz59d")return {kind:"unavailable"};
  const rows=await db`SELECT completed_uses,reserved_uses,limit_uses,period_end
    FROM public.life_launch_wallets WHERE member_key=${launch.memberKey}
    AND period_start=${launch.periodStart}::timestamptz LIMIT 1`;
  if(rows.length && (Number(rows[0].limit_uses)!==10 ||
     new Date(String(rows[0].period_end)).toISOString()!==launch.periodEnd))return {kind:"unavailable"};
  const counts=validatedUsageCounts(rows[0],10);
  return counts?{kind:"launch",limit:10,...counts,renewal:launch.periodEnd}:{kind:"unavailable"};
 }catch{return {kind:"unavailable"};}
}
