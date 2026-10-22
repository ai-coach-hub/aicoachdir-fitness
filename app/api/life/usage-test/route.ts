import {currentUser} from "@clerk/nextjs/server";
import {bindPrivatePreviewMember} from "@/lib/previewSharedMemberBinding";
import {lifeTester} from "@/lib/lifeCoachAccess";
import {previewTestAvailable,lifeTestStatus,enrollLifeTest} from "@/lib/previewLifeTestEnrollment";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 if(!previewTestAvailable())return reply({ok:false,error:"Test not enabled"},404);
 const member=await lifeTester();
 if(!member)return reply({ok:false,error:"Not authorized"},403);
 try{return reply({ok:true,...await lifeTestStatus(member)})}
 catch{return reply({ok:false,error:"Preview test unavailable"},503)}
}
export async function POST(){
 if(!previewTestAvailable())return reply({ok:false,error:"Test not enabled"},404);
 const member=await lifeTester();
 if(!member)return reply({ok:false,error:"Not authorized"},403);
 try{
  const user=await currentUser();
  const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
  if(!user||user.id!==member||!primary||
     primary.verification?.status!=="verified")
   return reply({ok:false,error:"Verified tester required"},403);
  const status=await enrollLifeTest(member);
  await bindPrivatePreviewMember(member,primary.emailAddress.trim().toLowerCase());
  return reply({ok:true,...status});
 }catch{return reply({ok:false,error:"Preview enrollment unavailable"},503)}
}
