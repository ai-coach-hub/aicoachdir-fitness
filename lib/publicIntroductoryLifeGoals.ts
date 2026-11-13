/**
 * Introductory Life goal capture uses the SAME Clerk-owned Life goal store
 * that the paid Life Coach reads after conversion. No model call or quota
 * reservation: the paid Life Coach also saves explicitly stated goals without
 * spending an AI message.
 *
 * This is not a general bypass around trial admission. The caller has already
 * independently verified signed-in Clerk identity and the active trial.
 */
import {createHash} from "node:crypto";
import {saveLifeTurn,readLifeThread} from "@/lib/lifeCoachStore";

export function explicitLifeGoalRequest(message:string):boolean{
 const text=message.trim();
 if(!text||text.length>6000)return false;
 return /\bmy goal\b/i.test(text)&&
        /\bplease remember (?:this|that|my|it)\b/i.test(text) &&
        !/\b(?:suicid(?:al|e)|self[- ]?harm|kill myself|hurt(?:ing)? myself|overdose|starv(?:e|ing)|purging|danger to myself)\b/i.test(text);
}
export async function saveIntroductoryLifeGoal(
 memberClerkId:string,requestKey:string,message:string,
):Promise<{response:string;conversationId:string}>{
 if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(memberClerkId)||
    !/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)||
    !explicitLifeGoalRequest(message))
  throw Error("Invalid goal capture");
 // Identical request keys map to the same thread. Never create a duplicate
 // goal or invent a second save on ambiguous network retries.
 const stable=createHash("sha256").update("intro-life-goal-v1\n"+requestKey).digest("hex").slice(0,40);
 const conversationId="life-coach-"+stable;
 const previous=await readLifeThread(memberClerkId,conversationId);
 const response="Got it. I'll remember that goal for our future Life Coach conversations. We can build on it whenever you're ready.";
 if(previous!==null){
  if(previous.length===2&&previous[0].text===message&&previous[1].text===response)
   return {response,conversationId};
  throw Error("Goal request already recorded with a different result");
 }
 await saveLifeTurn(memberClerkId,conversationId,message,response);
 const readback=await readLifeThread(memberClerkId,conversationId);
 if(readback?.length!==2||readback[0].text!==message||readback[1].text!==response)
  throw Error("Saved goal was not verified");
 return {response,conversationId};
}
