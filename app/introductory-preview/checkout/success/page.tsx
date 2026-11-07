/**
 * Isolated Stripe TEST checkout confirmation for dedicated synthetic tester.
 * Never grants Pickaxe production access or writes a production membership.
 */
import {currentUser} from "@clerk/nextjs/server";
import {assertIsolatedTrialTestCheckout} from "@/lib/isolatedTrialCheckoutSafety";
import {introHistorySql,readTrialTurns} from "@/lib/isolatedTrialHistory";
import {finalizeIsolatedTrialConversion} from "@/lib/isolatedTrialPaidHandoff";
import {saveFitnessMembership} from "@/lib/fitnessMembershipDb";
import {stripeRequest,stripeSubscriptionIsActive} from "@/lib/stripeServer";
export const dynamic="force-dynamic";
type Props={searchParams:Promise<{session_id?:string|string[]}>};
const asRecord=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export default async function PrivateTrialTestSuccess({searchParams}:Props){
 let state="Payment not confirmed. No additional checkout should be attempted.";
 let confirmed=false;
 let retained=0;
 try{
  await assertIsolatedTrialTestCheckout();
  const user=await currentUser();
  const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
  if(!user||primary?.verification?.status!=="verified")throw Error("Sign in to the original test account");
  const email=primary.emailAddress.trim().toLowerCase();
  const params=await searchParams;
  const id=String(Array.isArray(params.session_id)?params.session_id[0]:params.session_id||"");
  if(!/^cs_test_[A-Za-z0-9_]+$/.test(id))throw Error("Invalid test session");
  const sql=await introHistorySql();
  const grant=await sql`SELECT clerk_user_id FROM public.introductory_trial_grants
   WHERE clerk_user_id=${user.id} LIMIT 1`;
  if(grant.length!==1)throw Error("No isolated trial");
  const session=await stripeRequest("/checkout/sessions/"+encodeURIComponent(id)+"?expand[]=subscription");
  const metadata=asRecord(session.metadata);
  const subscriptionRecord=asRecord(session.subscription);
  const subscriptionId=String(subscriptionRecord.id||session.subscription||"");
  const customerId=String(session.customer||"");
  if(session.livemode!==false||session.mode!=="subscription"||session.status!=="complete"||
     session.payment_status!=="paid"||metadata.intro_trial_preview!=="true"||
     metadata.clerk_user_id!==user.id||metadata.trial_email!==email||
     session.client_reference_id!==user.id||
     !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)||
     !/^cus_[A-Za-z0-9]+$/.test(customerId))
   throw Error("Test session identity or payment not verified");
  const sub=await stripeRequest("/subscriptions/"+encodeURIComponent(subscriptionId));
  if(sub.livemode!==false||sub.customer!==customerId||!stripeSubscriptionIsActive(sub.status)||
     asRecord(sub.metadata).intro_trial_preview!=="true"||
     asRecord(sub.metadata).clerk_user_id!==user.id)
   throw Error("Test subscription does not match the account");
  const customer=await stripeRequest("/customers/"+encodeURIComponent(customerId));
  if(customer.livemode!==false||customer.deleted===true||
     String(customer.email||"").trim().toLowerCase()!==email)
   throw Error("Stripe test customer identity mismatch");
  // The billing database and test key were confirmed by the safety gate.
  // Only this isolated branch receives the synthetic paid-membership record.
  await saveFitnessMembership({
   email,clerkUserId:user.id,customerId,subscriptionId,
   stripeStatus:String(sub.status),active:true,
   eventType:"intro_trial_private_test_checkout",eventId:id
  });
  const converted=await finalizeIsolatedTrialConversion({
   clerkId:user.id,paymentClerkId:String(session.client_reference_id),
   paid:true,active:true,customerMatches:true,subscriptionMatches:true
  });
  if(!["converted","already_converted"].includes(converted))
   throw Error("Trial conversion was not recorded");
  const turns=await readTrialTurns(user.id);
  retained=turns.length;
  confirmed=true;
  state="TEST subscription verified. Your saved trial conversations are still available.";
 }catch{
  // Do not expose payment details or encourage duplicate checkout attempts.
  state="Unable to finish verifying this TEST checkout. Do not pay again; inspect the private testing records.";
 }
 return <main style={{maxWidth:720,margin:"3rem auto",padding:"1rem"}}>
  <p>Private trial — simulated billing only</p>
  <h1>{confirmed?"Test conversion confirmed":"Test conversion needs review"}</h1>
  <p>{state}</p>
  {confirmed&&<p>Saved conversations retained: {retained}</p>}
  {confirmed&&<p><a href="/introductory-preview/paid">View the three saved conversations in the converted test account</a></p>}
  <a href="/introductory-preview">Return to private trial</a>
 </main>;
}
