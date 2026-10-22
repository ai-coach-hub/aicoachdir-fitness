import {createHmac} from "node:crypto";
// Cross-application shared usage key derived ONLY from a verified Clerk email.
// Both preview apps must use identical server-held secrets, never in browser.
export function sharedUsageMemberKey(verifiedMemberEmail:string,serverSecret:string){
 const normalized=String(verifiedMemberEmail||"").trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||serverSecret.length<32)
  return "";
 return "member_"+createHmac("sha256",serverSecret)
   .update("aicoachdir-shared-v1\n"+normalized).digest("hex");
}
