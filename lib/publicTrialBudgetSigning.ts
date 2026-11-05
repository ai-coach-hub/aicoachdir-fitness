import {createHmac,timingSafeEqual} from "node:crypto";
const validEmail=(v:string)=>v===v.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const validClerk=(v:string)=>/^user_[A-Za-z0-9_-]{8,128}$/.test(v);
function secret(){const s=String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||"");if(s.length<32)throw Error("Trial budget signing unavailable");return s;}
export function trialBudgetHandoffSignature(email:string,clerkId:string,expires:string){
 if(!validEmail(email)||!validClerk(clerkId)||!/^\d{13}$/.test(expires))throw Error("Invalid handoff");
 return createHmac("sha256",secret()).update("trial-budget-handoff-v1\n"+email+"\n"+clerkId+"\n"+expires).digest("hex");
}
export function trialBudgetAttestationSignature(email:string,clerkId:string,issued:string){
 if(!validEmail(email)||!validClerk(clerkId)||!/^\d{13}$/.test(issued))throw Error("Invalid attestation");
 return createHmac("sha256",secret()).update("trial-budget-attestation-v1\n"+email+"\n"+clerkId+"\n"+issued).digest("hex");
}
export function verifyTrialBudgetAttestation(email:string,clerkId:string,issued:string,supplied:string,now=Date.now()){
 if(!/^\d{13}$/.test(issued)||!Number.isFinite(now)||
  Math.abs(Number(issued)-now)>30_000||! /^[0-9a-f]{64}$/.test(supplied))return false;
 let expected:string;
 try{expected=trialBudgetAttestationSignature(email,clerkId,issued);}catch{return false;}
 return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex"));
}
