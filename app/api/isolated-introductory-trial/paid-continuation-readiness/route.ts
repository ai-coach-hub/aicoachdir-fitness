/** Private preview paid-continuation readiness: read-only, never mints messages. */
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {verifiedIsolatedPaidContinuation} from "@/lib/isolatedPaidContinuation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 if(!isolatedTrialPreviewEnabled())return Response.json({ok:false},{status:404});
 const verified=await verifiedIsolatedPaidContinuation();
 return Response.json(verified.ready
   ?{ok:true,historyReady:true,paidMessagesReady:true,remaining:verified.remaining}
   :{ok:false,paidMessagesReady:false,reason:verified.reason},
  {status:verified.ready?200:503,headers:{"Cache-Control":"private, no-store"}});
}
