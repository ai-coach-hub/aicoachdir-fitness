import {NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {reconcileTierRenewal,reconcileExpiredTierPayment} from "@/lib/tierRenewalReconciler";
import {reconcileProductionPaidUpgrade} from "@/lib/productionPaidUpgradeReconciler";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function signed(raw:string,header:string,secret:string){
 if(!secret.startsWith("whsec_")||raw.length>200000||!header)return false;
 const parts=header.split(",").map(x=>x.trim());
 const ts=parts.find(x=>x.startsWith("t="))?.slice(2)||"";
 if(!/^[0-9]{9,12}$/.test(ts)||
 Math.abs(Date.now()-Number(ts)*1000)>300000)return false;
 const expected=createHmac("sha256",secret).update(ts+"."+raw).digest();
 return parts.filter(p=>p.startsWith("v1=")).some(p=>{
 const v=p.slice(3);
 return /^[a-fA-F0-9]{64}$/.test(v)&&timingSafeEqual(expected,Buffer.from(v,"hex"));
 });
}
export async function POST(req:Request){
 const preview=process.env.VERCEL_ENV==="preview";
 if(preview?(process.env.UPGRADE_SANDBOX_WEBHOOK_ENABLED!=="true"||process.env.VERCEL_GIT_COMMIT_REF!=="feature/production-tier-release-guards-20261029"):(process.env.VERCEL_ENV!=="production"||process.env.PRODUCTION_UPGRADE_WEBHOOK_ENABLED!=="true"))
 return NextResponse.json({error:"not_found"},{status:404});
 const raw=await req.text();
 const secret=process.env[preview?"UPGRADE_SANDBOX_STRIPE_WEBHOOK_SECRET":"PRODUCTION_UPGRADE_STRIPE_WEBHOOK_SECRET"]||"";
 if(!signed(raw,req.headers.get("stripe-signature")||"",secret)){
 console.error("[tier-change-webhook] invalid-signature");
 return NextResponse.json({error:"invalid_signature"},{status:400});
 }
 let event:Record<string,unknown>;
 try{
 const parsed=JSON.parse(raw);
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
 event=parsed;
 }catch{return NextResponse.json({error:"invalid_event"},{status:400});}
 const obj=(event.data as {object?:Record<string,unknown>}|undefined)?.object;
 if(event.livemode!==!preview||!["invoice.paid","invoice.voided"].includes(String(event.type))||
 obj?.object!=="invoice"||obj?.livemode!==!preview||
 typeof obj?.id!=="string"||!/^in_[A-Za-z0-9]+$/.test(obj.id))
 return NextResponse.json({received:true,ignored:true});
 try{
 let status:string;
 if(event.type==="invoice.voided")status=await reconcileExpiredTierPayment(obj.id);
 else if(obj.billing_reason==="subscription_cycle")status=await reconcileTierRenewal(obj.id);
 else status=await reconcileProductionPaidUpgrade({eventType:"invoice.paid",invoiceId:obj.id,signedWebhook:true});
 return NextResponse.json({received:true,status});
 }catch(error){
 console.error("[tier-change-webhook] reconciliation-failed",{
  message:error instanceof Error?error.message:String(error),
 });
 return NextResponse.json({error:"retry"},{status:503});
 }
}
