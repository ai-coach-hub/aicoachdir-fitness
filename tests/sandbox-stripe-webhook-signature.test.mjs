import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {verifySandboxStripeSignature,sandboxInvoiceEvent} from "../lib/sandboxStripeWebhookSignature.ts";
const secret="whsec_"+"x".repeat(45),timestamp=1700000000,body=JSON.stringify({id:"evt_fake",type:"invoice.paid",livemode:false,data:{object:{id:"in_SYNTHETIC12345678",object:"invoice",livemode:false}}});
const sign=(s=body,t=timestamp)=>"t="+t+",v1="+createHmac("sha256",secret).update(t+"."+s).digest("hex");
test("sandbox Stripe signature checks HMAC body and timestamp",()=>{
 assert.equal(verifySandboxStripeSignature(body,sign(),secret,timestamp*1000),true);
 assert.equal(verifySandboxStripeSignature(body+"!",sign(),secret,timestamp*1000),false);
 assert.equal(verifySandboxStripeSignature(body,sign(),secret,(timestamp+301)*1000),false);
 assert.equal(verifySandboxStripeSignature(body,sign(),"whsec_wrong",timestamp*1000),false);
});
test("accepts only test invoice.paid, never production or customer invoice claims",()=>{
 const v=JSON.parse(body);
 assert.deepEqual(sandboxInvoiceEvent(v),{type:"invoice.paid",invoiceId:"in_SYNTHETIC12345678"});
 assert.equal(sandboxInvoiceEvent({...v,livemode:true}),null);
 assert.equal(sandboxInvoiceEvent({...v,type:"customer.subscription.updated"}),null);
 assert.equal(sandboxInvoiceEvent({...v,data:{object:{...v.data.object,livemode:true}}}),null);
});
