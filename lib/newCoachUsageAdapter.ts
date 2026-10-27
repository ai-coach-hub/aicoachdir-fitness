import "server-only";
import { reserveSharedUsage,settleSharedUsage } from "./sharedUsageMeter";
import type { QuotaCoach } from "./sharedUsageMeter";
/**
 * New coach billing adapter. The existing wallet currently authorizes only
 * Fitness, Budgeting and Life. Unknown coaches, including Career, fail closed
 * until the central ledger migration and release are reviewed.
 */
const SUPPORTED_COACHES=new Set<QuotaCoach>(["fitness","budgeting","life"]);
export function supportedSharedCoach(slug:string):slug is QuotaCoach {
 return SUPPORTED_COACHES.has(slug as QuotaCoach);
}
export function newCoachUsagePorts(slug:string,email:string,requestKey:string){
 if(!supportedSharedCoach(slug))return null;
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)||!email)return null;
 return {
  reserve:async()=> (await reserveSharedUsage(email,slug,requestKey)).status,
  settle:async(outcome:"completed"|"released"|"uncertain")=>
    settleSharedUsage(email,slug,requestKey,outcome),
 };
}
