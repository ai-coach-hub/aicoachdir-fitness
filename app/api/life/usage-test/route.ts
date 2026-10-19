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
 try{return reply({ok:true,...await enrollLifeTest(member)})}
 catch{return reply({ok:false,error:"Preview enrollment unavailable"},503)}
}
