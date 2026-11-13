import {currentUser} from "@clerk/nextjs/server";
import {readVerifiedTrialFitnessWorkouts} from "@/app/api/fitness/chat/route";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")
  return Response.json({ok:false,error:"Verified sign-in required"},{status:401});
 const email=primary.emailAddress.trim().toLowerCase();
 try{
  const data=await readVerifiedTrialFitnessWorkouts(user.id,email);
  return Response.json({ok:true,plan:data.plan,historyEntries:data.historyEntries},{
   headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({ok:false,error:"Saved trial workouts are not available for this account"},{status:403});}
}
