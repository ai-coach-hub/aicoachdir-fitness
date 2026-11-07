import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {readPrivateNativeReadback} from "@/lib/privateNativeReadback";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 if(!isolatedTrialPreviewEnabled())return Response.json({ok:false},{status:404,headers:{"Cache-Control":"no-store"}});
 try{
   const result=await readPrivateNativeReadback();
   if(!result)return Response.json({ok:false,error:"Dedicated verified test login required"},{status:403,headers:{"Cache-Control":"private, no-store"}});
   return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({ok:false,error:"Isolated readback unavailable"},{status:503,headers:{"Cache-Control":"private, no-store"}});}
}
