import {createHmac,timingSafeEqual} from "node:crypto";

/** Accept only recent HMAC-signed Stripe events delivered to the private
 * sandbox endpoint. This does not touch or trust the production webhook key.
 */
export function verifySandboxStripeSignature(raw:string,header:string,secret:string,now=Date.now()):boolean{
 if(!secret.startsWith("whsec_")||secret.length<20||!header||raw.length>200000)return false;
 const parts=header.split(",").map(s=>s.trim());
 const t=parts.find(x=>x.startsWith("t="))?.slice(2)||"";
 if(!/^[0-9]{9,12}$/.test(t))return false;
 const time=Number(t)*1000;
 if(!Number.isFinite(time)||Math.abs(now-time)>300000)return false;
 const computed=createHmac("sha256",secret).update(t+"."+raw).digest();
 return parts.filter(x=>x.startsWith("v1=")).some(x=>{
  const sig=x.slice(3);
  if(!/^[0-9a-f]{64}$/i.test(sig))return false;
  return timingSafeEqual(computed,Buffer.from(sig,"hex"));
 });
}
export function sandboxInvoiceEvent(value:unknown):{type:string;invoiceId:string}|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const e=value as Record<string,unknown>;
 if(e.livemode!==false||e.type!=="invoice.paid")return null;
 const data=e.data&&typeof e.data==="object"&&!Array.isArray(e.data)
  ?e.data as Record<string,unknown>:null;
 const o=data?.object&&typeof data.object==="object"&&!Array.isArray(data.object)
  ?data.object as Record<string,unknown>:null;
 if(o?.object!=="invoice"||o.livemode!==false||
 typeof o.id!=="string"||!/^in_[A-Za-z0-9]+$/.test(o.id))return null;
 return {type:"invoice.paid",invoiceId:o.id};
}
