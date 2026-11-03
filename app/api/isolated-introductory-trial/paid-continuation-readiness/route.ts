/**
 * Private read-only paid continuation readiness.
 * Proves whether the converted synthetic tester has a verified Stripe TEST
 * subscription and a durable paid shared-usage wallet before enabling any
 * post-trial messages. NO wallet creation, charge, or AI provider call.
 */
import {currentUser} from "@clerk/nextjs/server";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {assertIsolatedTrialTestCheckout} from "@/lib/isolatedTrialCheckoutSafety";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {stripeRequest} from "@/lib/stripeServer";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 if(!isolatedTrialPreviewEnabled())return response({ok:false},404);
 try{
  const user=await currentUser();
  const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
  if(!user||user.id!==process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||
     !primary||primary.verification?.status!=="verified")return response({ok:false},403);
  const email=primary.emailAddress.trim().toLowerCase();
  await assertIsolatedTrialTestCheckout();
  const sql=await introHistorySql();
  const [grants,records]=await Promise.all([
   sql`SELECT member_key,converted_at FROM public.introductory_trial_grants
     WHERE clerk_user_id=${user.id} LIMIT 1`,
   sql`SELECT stripe_customer_id,stripe_subscription_id,access_active,stripe_status
     FROM public.fitness_memberships WHERE clerk_user_id=${user.id}
     AND email=${email} LIMIT 1`
  ]);
  if(grants.length!==1||grants[0].converted_at==null||records.length!==1||
     records[0].access_active!==true||
     !["active","trialing"].includes(String(records[0].stripe_status)))
   return response({ok:true,historyReady:false,paidMessagesReady:false,reason:"membership_not_verified"});
  const customerId=String(records[0].stripe_customer_id||"");
  const subscriptionId=String(records[0].stripe_subscription_id||"");
  if(!/^cus_[A-Za-z0-9]+$/.test(customerId)||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
   return response({ok:true,historyReady:true,paidMessagesReady:false,reason:"billing_link_missing"});
  const [sub,customer]=await Promise.all([
   stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId)),
   stripeRequest("/customers/"+encodeURIComponent(customerId))
  ]);
  if(sub.livemode!==false||sub.id!==subscriptionId||sub.customer!==customerId||
     !["active","trialing"].includes(String(sub.status))||
     customer.livemode!==false||customer.id!==customerId||
     customer.deleted===true||String(customer.email||"").toLowerCase()!==email)
   return response({ok:true,historyReady:true,paidMessagesReady:false,reason:"test_subscription_unverified"});
  const wallet=await sql`SELECT entitlement_key,period_start,period_end,limit_uses,
    completed_uses,reserved_uses FROM public.shared_ai_usage_periods
    WHERE member_key=${String(grants[0].member_key)}
      AND period_start<=now() AND period_end>now() LIMIT 2`;
  if(wallet.length!==1)return response({
   ok:true,historyReady:true,paidMessagesReady:false,reason:"paid_wallet_not_configured"
  });
  const w=wallet[0];
  const limit=Number(w.limit_uses),completed=Number(w.completed_uses),reserved=Number(w.reserved_uses);
  const valid=typeof w.entitlement_key==="string"&&w.entitlement_key.length>0&&
    Number.isInteger(limit)&&limit>0&&Number.isInteger(completed)&&completed>=0&&
    Number.isInteger(reserved)&&reserved>=0&&completed+reserved<=limit;
  // Still disabled: a paid message endpoint must be installed and proven to
  // use the wallet before paid chat can be declared ready.
  return response({ok:true,historyReady:true,paidMessagesReady:false,
   reason:valid?"paid_chat_not_connected":"paid_wallet_invalid"});
 }catch{
  return response({ok:false,historyReady:false,paidMessagesReady:false,reason:"verification_unavailable"},503);
 }
}
