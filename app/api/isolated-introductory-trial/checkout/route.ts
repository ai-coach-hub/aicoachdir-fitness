/**
 * Dedicated test-only checkout for synthetic PR #251 users.
 * POST only; never accepts client price/account data or a production key.
 */
import {resolveIsolatedIntroductoryAccount,isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {assertIsolatedTrialTestCheckout} from "@/lib/isolatedTrialCheckoutSafety";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {stripeRequest} from "@/lib/stripeServer";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 if(!isolatedTrialPreviewEnabled())return json({ok:false},404);
 try{
  const account=await resolveIsolatedIntroductoryAccount();
  if(!account)return json({ok:false,error:"Dedicated test account required"},403);
  await assertIsolatedTrialTestCheckout();
  const sql=await introHistorySql();
  const grant=await sql`SELECT clerk_user_id,converted_at FROM public.introductory_trial_grants
   WHERE clerk_user_id=${account.clerkUserId} LIMIT 1`;
  if(grant.length!==1||grant[0].converted_at!==null)
   return json({ok:false,error:"Test trial is unavailable or already converted"},409);
  // A fixed preview-only test price: never use live catalog prices.
  const origin=new URL(request.url).origin;
  const body=new URLSearchParams();
  body.set("mode","subscription");
  body.set("customer_email",account.verifiedEmail);
  body.set("client_reference_id",account.clerkUserId);
  body.set("line_items[0][price_data][currency]","usd");
  body.set("line_items[0][price_data][unit_amount]","1500");
  body.set("line_items[0][price_data][recurring][interval]","month");
  body.set("line_items[0][price_data][product_data][name]","AI Coach Directory Growth - TEST ONLY");
  body.set("line_items[0][quantity]","1");
  body.set("success_url",origin+"/introductory-preview/checkout/success?session_id={CHECKOUT_SESSION_ID}");
  body.set("cancel_url",origin+"/introductory-preview");
  for(const prefix of ["metadata","subscription_data[metadata]"]){
   body.set(prefix+"[intro_trial_preview]","true");
   body.set(prefix+"[clerk_user_id]",account.clerkUserId);
  }
  body.set("metadata[trial_email]",account.verifiedEmail);
  const session=await stripeRequest("/checkout/sessions",{
   method:"POST",body,idempotencyKey:"intro-preview-growth-"+account.clerkUserId,
  });
  if(session.livemode!==false || !String(session.id||"").startsWith("cs_test_") ||
      !String(session.url||"").startsWith("https://checkout.stripe.com/"))
   return json({ok:false,error:"Stripe did not return a verified test checkout"},503);
  return json({ok:true,url:session.url});
 }catch{
  return json({ok:false,error:"Private test checkout is unavailable. No live payment was attempted."},503);
 }
}
