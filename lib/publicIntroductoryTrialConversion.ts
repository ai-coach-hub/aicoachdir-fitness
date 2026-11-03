/**
 * Public trial -> paid conversion attestation. Disabled until the reviewed
 * production schema is explicitly activated. Never mutates Stripe or existing
 * memberships, and never deletes or relocates saved trial conversations.
 */
import {membershipDb} from "@/lib/fitnessMembershipDb";
import {stripeRequest} from "@/lib/stripeServer";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
const PROD_BRANCH="br-sparkling-glitter-aucpz59d";
const entity=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function publicTrialConversionEnabled(){
 return process.env.VERCEL_ENV==="production" &&
   process.env.PUBLIC_INTRO_TRIAL_CONVERSION_ENABLED==="true" &&
   process.env.PUBLIC_INTRO_TRIAL_SCHEMA_READY==="true";
}
export async function finalizePublicTrialPaidConversion(args:{
 clerkId:string;email:string;customerId:string;subscriptionId:string;
}):Promise<"converted"|"already_converted"|"no_trial"|"unavailable">{
 if(!publicTrialConversionEnabled())return "unavailable";
 if(!/^user_[A-Za-z0-9_-]{8,128}$/.test(args.clerkId)||
    !/^cus_[A-Za-z0-9]+$/.test(args.customerId)||
    !/^sub_[A-Za-z0-9]+$/.test(args.subscriptionId)||
    args.email!==args.email.trim().toLowerCase())return "unavailable";
 const memberKey=sharedUsageMemberKey(args.email,String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!memberKey)return "unavailable";
 const sql=membershipDb();
 const check=await sql`SELECT current_setting('neon.branch_id',true) AS branch`;
 if(String(check[0]?.branch)!==PROD_BRANCH)throw Error("Production trial storage mismatch");
 // Stripe is read-only here. No trial conversion is accepted from a mere
 // subscription ID supplied by the browser or a stale membership record.
 const [sub,customer,linked]=await Promise.all([
  stripeRequest("/subscriptions/"+encodeURIComponent(args.subscriptionId)),
  stripeRequest("/customers/"+encodeURIComponent(args.customerId)),
  sql`SELECT access_active,stripe_customer_id,stripe_subscription_id
   FROM public.fitness_memberships WHERE email=${args.email}
   AND clerk_user_id=${args.clerkId} LIMIT 2`
 ]);
 const items=entity(sub.items);
 const liveInvoice=entity(sub.latest_invoice);
 if(sub.livemode!==true||sub.id!==args.subscriptionId||
    sub.customer!==args.customerId||sub.status!=="active"||
    customer.livemode!==true||customer.id!==args.customerId||
    customer.deleted===true||String(customer.email||"").trim().toLowerCase()!==args.email||
    linked.length!==1||linked[0].access_active!==true||
    linked[0].stripe_customer_id!==args.customerId||
    linked[0].stripe_subscription_id!==args.subscriptionId)
  return "unavailable";
 const invoiceId=typeof sub.latest_invoice==="string"?sub.latest_invoice:String(liveInvoice.id||"");
 if(!/^in_[A-Za-z0-9]+$/.test(invoiceId))return "unavailable";
 const invoice=await stripeRequest("/invoices/"+encodeURIComponent(invoiceId));
 if(invoice.livemode!==true||invoice.status!=="paid"||
    Number(invoice.amount_remaining)!==0||
    invoice.customer!==args.customerId||
    Number(invoice.amount_paid)<=0)return "unavailable";
 const grants=await sql`SELECT converted_at FROM public.introductory_trial_grants
 WHERE clerk_user_id=${args.clerkId} AND member_key=${memberKey} LIMIT 2`;
 if(grants.length===0)return "no_trial";
 if(grants.length!==1)return "unavailable";
 if(grants[0].converted_at!=null)return "already_converted";
 const rows=await sql`UPDATE public.introductory_trial_grants
 SET converted_at=now() WHERE clerk_user_id=${args.clerkId}
 AND member_key=${memberKey} AND converted_at IS NULL
 RETURNING clerk_user_id`;
 return rows.length===1?"converted":"already_converted";
}
