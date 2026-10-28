import {NextResponse} from "next/server";
import {verifySandboxStripeSignature,sandboxInvoiceEvent} from "@/lib/sandboxStripeWebhookSignature";
import {processSandboxPaidUpgradeWebhook} from "@/lib/sandboxPaidUpgradeWebhook";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(process.env.VERCEL_ENV!=="preview"||
 process.env.UPGRADE_SANDBOX_WEBHOOK_ENABLED!=="true")
 return NextResponse.json({error:"not_found"},{status:404});
 const body=await req.text();
 const secret=process.env.UPGRADE_SANDBOX_STRIPE_WEBHOOK_SECRET||"";
 if(!verifySandboxStripeSignature(body,req.headers.get("stripe-signature")||"",secret))
 return NextResponse.json({error:"signature_invalid"},{status:400});
 let event:unknown;
 try{event=JSON.parse(body)}catch{return NextResponse.json({error:"invalid_event"},{status:400})}
 const invoice=sandboxInvoiceEvent(event);
 if(!invoice)return NextResponse.json({received:true,ignored:true});
 try{
  const result=await processSandboxPaidUpgradeWebhook({eventType:invoice.type,invoiceId:invoice.invoiceId});
  return NextResponse.json({received:true,result});
 }catch{
  // Stripe retries non-2xx responses; avoid leaking billing or DB details.
  return NextResponse.json({error:"retry"},{status:503});
 }
}
