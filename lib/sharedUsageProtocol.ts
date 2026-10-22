import {createHmac,timingSafeEqual} from "node:crypto";
// Only authenticated server routes may issue or verify this protocol.
// Reuse the existing cross-app membership secret with domain-separated keys;
// never accept claims about subscription status, limits or dates from clients.
export type SharedUsageEvent={
 version:1; action:"reserve"|"settle"; coach:"budgeting";
 email:string; requestKey:string; issuedAt:number;
 outcome?:"completed"|"released"|"uncertain";
};
const canonical=(x:SharedUsageEvent)=>JSON.stringify([
 x.version,x.action,x.coach,x.email,x.requestKey,x.issuedAt,x.outcome||""
]);
function subkey(root:string,label:string){
 return createHmac("sha256",root).update("aicoachdir:"+label+":v1").digest();
}
const goodSecret=(v:string)=>typeof v==="string"&&Buffer.byteLength(v,"utf8")>=32;
const goodEmail=(v:unknown)=>typeof v==="string" &&
 v===v.trim().toLowerCase() && v.length<=254 &&
 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export function sharedMemberKey(verifiedEmail:string,root:string){
 if(!goodEmail(verifiedEmail)||!goodSecret(root))return "";
 return "member_"+createHmac("sha256",subkey(root,"member-identity"))
  .update(verifiedEmail,"utf8").digest("hex");
}
export function signUsageEvent(event:SharedUsageEvent,root:string){
 if(!goodSecret(root))throw Error("Shared usage authentication is not configured");
 return createHmac("sha256",subkey(root,"service-event"))
  .update(canonical(event),"utf8").digest("hex");
}
export function verifyUsageEvent(
 event:SharedUsageEvent,signature:string,root:string,now:number=Date.now()
):boolean{
 if(!goodSecret(root)||!event||event.version!==1||
    !["reserve","settle"].includes(event.action)||
    event.coach!=="budgeting"||
    !goodEmail(event.email)||
    !/^[A-Za-z0-9_-]{16,100}$/.test(event.requestKey)||
    !Number.isSafeInteger(event.issuedAt)||
    Math.abs(now-event.issuedAt)>120_000||
    (event.action==="reserve" && event.outcome!==undefined)||
    (event.action==="settle" && !["completed","released","uncertain"].includes(String(event.outcome)))||
    typeof signature!=="string"||!/^[0-9a-f]{64}$/.test(signature))return false;
 const expected=Buffer.from(signUsageEvent(event,root),"hex");
 const actual=Buffer.from(signature,"hex");
 return actual.length===expected.length && timingSafeEqual(actual,expected);
}
