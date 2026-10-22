import {createHmac,timingSafeEqual} from "node:crypto";

// Internal service-to-service request. The authenticated Budgeting server
// supplies only its verified-cookie email, a request id and a lifecycle action.
// Member ID, billing period, allowance and subscription MUST be resolved by the
// Fitness hub, never accepted from this body. Shared secret stays server-side.
export type SharedUsageServiceAction="reserve"|"settle";
export type SharedUsageServiceRequest={
 version:1; audience:"aicoachdir-usage-hub"; actor:"budgeting";
 action:SharedUsageServiceAction; memberEmail:string; requestKey:string;
 outcome:"completed"|"released"|"uncertain"|null; issuedAt:number;
};
const validEmail=(v:unknown)=>typeof v==="string" && v===v.trim().toLowerCase() &&
 /^[^\s@]{1,64}@[^\s@]{1,189}$/.test(v) && v.length<=254;
const validKey=(v:unknown)=>typeof v==="string" && /^[A-Za-z0-9_-]{16,100}$/.test(v);

export function canonicalSharedUsageRequest(v:SharedUsageServiceRequest):string {
 return "aicoachdir-usage-service-v1\n"+JSON.stringify([
  v.version,v.audience,v.actor,v.action,v.memberEmail,v.requestKey,
  v.outcome,v.issuedAt
 ]);
}
export function sharedUsageRequestValid(v:SharedUsageServiceRequest,nowMs:number):boolean {
 return !!v && v.version===1 && v.audience==="aicoachdir-usage-hub" &&
  v.actor==="budgeting" && ["reserve","settle"].includes(v.action) &&
  validEmail(v.memberEmail) && validKey(v.requestKey) &&
  (v.action==="reserve" ? v.outcome===null :
   ["completed","released","uncertain"].includes(String(v.outcome))) &&
  Number.isSafeInteger(v.issuedAt) && Number.isSafeInteger(nowMs) &&
  v.issuedAt<=nowMs+30_000 && v.issuedAt>=nowMs-120_000;
}
export function signSharedUsageServiceRequest(
 v:SharedUsageServiceRequest,secret:string
):string {
 if(typeof secret!=="string"||secret.length<32)throw Error("Internal usage signing is unavailable");
 return createHmac("sha256",secret).update(canonicalSharedUsageRequest(v)).digest("hex");
}
export function verifySharedUsageServiceRequest(
 v:SharedUsageServiceRequest,signature:string,secret:string,nowMs:number
):boolean {
 if(typeof secret!=="string"||secret.length<32 ||
   !sharedUsageRequestValid(v,nowMs) ||
   typeof signature!=="string"||!/^[0-9a-f]{64}$/.test(signature))
   return false;
 const expected=Buffer.from(signSharedUsageServiceRequest(v,secret),"hex");
 const actual=Buffer.from(signature,"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
