import {NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
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
 if(process.env.VERCEL_ENV!=="production"||
 process.env.PUBLIC_TIER_UPGRADES_ENABLED!=="true"||
 process.env.PRODUCTION_UPGRADE_WEBHOOK_ENABLED!=="true")
 return NextResponse.json({error:"not_found"},{status:404});
 const raw=await req.text();
 const secret=process.env.PRODUCTION_UPGRADE_STRIPE_WEBHOOK_SECRET||"";
 if(!signed(raw,req.headers.get("stripe-signature")||"",secret))
 return NextResponse.json({error:"invalid_signature"},{status:400});
 let event:Record<string,unknown>;
 try{
 const parsed=JSON.parse(raw);
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
 event=parsed;
 }catch{return NextResponse.json({error:"invalid_event"},{status:400});}
 const obj=(event.data as {object?:Record<string,unknown>}|undefined)?.object;
 if(event.livemode!==true||event.type!=="invoice.paid"||
 obj?.object!=="invoice"||obj?.livemode!==true||
 typeof obj?.id!=="string"||!/^in_[A-Za-z0-9]+$/.test(obj.id))
 return NextResponse.json({received:true,ignored:true});
 try{
 const status=await reconcileProductionPaidUpgrade({
 eventType:"invoice.paid",invoiceId:obj.id,signedWebhook:true
 });
 return NextResponse.json({received:true,status});
 }catch{return NextResponse.json({error:"retry"},{status:503});}
}
