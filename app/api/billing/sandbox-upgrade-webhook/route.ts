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
 // Only a signed, zero-total, standalone synthetic test invoice may be
 // acknowledged without consulting the upgrade database. Never apply this
 // shortcut to a subscription invoice or a nonzero payment.
 const envelope=event as {data?:{object?:Record<string,unknown>}};
 const obj=envelope.data?.object;
 const metadata=obj?.metadata && typeof obj.metadata==="object" ? obj.metadata as Record<string,unknown> : {};
 if(obj?.livemode===false && obj?.status==="paid" &&
    obj?.billing_reason==="manual" &&
    obj?.total===0 && obj?.amount_paid===0 &&
    metadata.synthetic==="true" &&
    metadata.purpose==="synthetic_webhook_delivery" &&
    !obj?.subscription &&
    !(obj?.parent && typeof obj.parent==="object" &&
      (obj.parent as Record<string,unknown>).subscription_details)) {
   return NextResponse.json({received:true,ignored:true,synthetic:true});
 }
 try{
  const result=await processSandboxPaidUpgradeWebhook({eventType:invoice.type,invoiceId:invoice.invoiceId});
  return NextResponse.json({received:true,result});
 }catch{
  // Stripe retries non-2xx responses; avoid leaking billing or DB details.
  return NextResponse.json({error:"retry"},{status:503});
 }
}
