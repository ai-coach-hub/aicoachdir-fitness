// This is only a private server-to-server preview contract. Never send the
// shared secret or signature to browser code or accept client-generated claims.
// In production a separate reviewed entitlement and usage ledger is required.
import {createHmac,timingSafeEqual} from "node:crypto";
export type BudgetSharedAction = "reserve"|"settle";
export type BudgetSharedOutcome = "completed"|"released"|"uncertain";
export type BudgetSharedCall = {
 action:BudgetSharedAction; email:string; requestKey:string; issuedAt:number;
 outcome?:BudgetSharedOutcome;
};
const normalized=(email:string)=>String(email||"").trim().toLowerCase();
export function canonicalBudgetSharedCall(call:BudgetSharedCall){
 return ["budget-shared-usage-v1",call.action,normalized(call.email),
         call.requestKey,String(call.issuedAt),call.outcome||""].join("\n");
}
export function signBudgetSharedCall(call:BudgetSharedCall,secret:string){
 if(typeof secret!=="string"||secret.length<32)return "";
 return createHmac("sha256",secret).update(canonicalBudgetSharedCall(call),"utf8").digest("hex");
}
export function verifyBudgetSharedCall(
 call:BudgetSharedCall,signature:string,secret:string,nowSeconds:number
):boolean{
 if(!call||!["reserve","settle"].includes(call.action)||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized(call.email))||
    normalized(call.email)!==call.email||
    !/^[A-Za-z0-9_-]{16,100}$/.test(call.requestKey)||
    !Number.isSafeInteger(call.issuedAt)||!Number.isSafeInteger(nowSeconds)||
    Math.abs(nowSeconds-call.issuedAt)>90||
    (call.action==="reserve"&&call.outcome!==undefined)||
    (call.action==="settle"&&!["completed","released","uncertain"].includes(call.outcome||""))||
    !/^[a-f0-9]{64}$/.test(signature)||secret.length<32)return false;
 const expected=Buffer.from(signBudgetSharedCall(call,secret),"hex");
 const actual=Buffer.from(signature,"hex");
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
