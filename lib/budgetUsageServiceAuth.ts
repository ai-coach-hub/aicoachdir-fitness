import {createHmac,timingSafeEqual} from "node:crypto";

// Server-to-server usage ledger command, never accepted directly from a browser.
// The Budgeting app authenticates its signed member cookie first. The hub still
// confirms membership, a permitted preview tester, and the existing ledger.
export type BudgetUsageCommand={
 version:1;email:string;coach:"budgeting";
 operation:"reserve"|"settle";requestKey:string;
 outcome?:"completed"|"released"|"uncertain";issuedAt:number;
};
const emailOk=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
export function validBudgetUsageCommand(value:unknown,nowSeconds:number):value is BudgetUsageCommand {
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Partial<BudgetUsageCommand>;
 return v.version===1&&v.coach==="budgeting"&&
  typeof v.email==="string"&&emailOk(v.email)&&v.email===v.email.trim().toLowerCase()&&
  typeof v.requestKey==="string"&&/^[A-Za-z0-9_-]{16,100}$/.test(v.requestKey)&&
  (v.operation==="reserve"||v.operation==="settle")&&
  (v.operation==="reserve"?(v.outcome===undefined):
   ["completed","released","uncertain"].includes(String(v.outcome)))&&
  Number.isSafeInteger(v.issuedAt)&&Number.isSafeInteger(nowSeconds)&&
  Math.abs(nowSeconds-v.issuedAt)<=120;
}
function canonical(v:BudgetUsageCommand){
 return JSON.stringify(["aicoachdir-usage-bridge-v1",v.version,v.email,v.coach,
  v.operation,v.requestKey,v.outcome??null,v.issuedAt]);
}
export function signBudgetUsageCommand(value:BudgetUsageCommand,secret:string){
 if(secret.length<32||!validBudgetUsageCommand(value,value.issuedAt))
  throw Error("Usage signing requires a valid command and server secret");
 return createHmac("sha256",secret).update(canonical(value)).digest("hex");
}
export function verifyBudgetUsageCommand(value:unknown,signature:string,secret:string,nowSeconds:number){
 if(secret.length<32||!validBudgetUsageCommand(value,nowSeconds)||
    !/^[0-9a-f]{64}$/.test(signature))return false;
 const expected=createHmac("sha256",secret).update(canonical(value)).digest();
 const actual=Buffer.from(signature,"hex");
 return actual.length===expected.length&&timingSafeEqual(expected,actual);
}
