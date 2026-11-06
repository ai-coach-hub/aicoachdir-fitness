import {currentUser} from "@clerk/nextjs/server";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {saveIntroductoryLifeGoal} from "@/lib/publicIntroductoryLifeGoals";
import {listLifeGoals} from "@/lib/lifeCoachStore";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const goal="My goal is to organize my desk for 10 minutes each morning. Please remember this.";
// A constant request key makes this safe to retry without duplicate goal turns.
const key="intro-native-life-goal-20261105";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request){
 if(!isolatedTrialPreviewEnabled())return reply({ok:false},404);
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified"||
    user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||""))
   return reply({ok:false,error:"Dedicated test account required"},403);
 const origin=request.headers.get("origin");
 const deployment=String(process.env.VERCEL_URL||"");
 if(!deployment||origin!=="https://"+deployment)
   return reply({ok:false,error:"Invalid test request origin"},403);
 try{
  const saved=await saveIntroductoryLifeGoal(user.id,key,goal);
  const goals=await listLifeGoals(user.id);
  if(!goals.some(g=>g.text===goal))
   return reply({ok:false,error:"Native saved goal could not be read back"},503);
  return reply({ok:true,verified:true,goal,conversationId:saved.conversationId,goalCount:goals.length});
 }catch{
  return reply({ok:false,error:"Native Life save/readback unavailable; do not retry until checked"},503);
 }
}
