import {currentUser} from "@clerk/nextjs/server";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {introHistorySql} from "@/lib/isolatedTrialHistory";
import {trialBudgetHandoffSignature} from "@/lib/publicTrialBudgetSigning";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const target="https://aicoachdir-budgeting-git-feature-introductory-trial-f7fdd5-kcb3.vercel.app";
export async function GET(request:Request){
 const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
 if(!isolatedTrialPreviewEnabled())return new Response(null,{status:404,headers});
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||user.id!==String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID||"")||
    primary?.verification?.status!=="verified")
  return new Response("Dedicated verified test account required.",{status:403,headers});
 const email=primary.emailAddress.trim().toLowerCase();
 try{
  // The test account is converted already; keep the validated original
  // Clerk identity, without writing trial grants or calling Stripe.
  const sql=await introHistorySql();
  const [grant,member]=await Promise.all([
   sql`SELECT converted_at FROM public.introductory_trial_grants
       WHERE clerk_user_id=${user.id} LIMIT 2`,
   sql`SELECT 1 FROM public.fitness_memberships
       WHERE clerk_user_id=${user.id} AND email=${email}
       AND access_active=true AND stripe_subscription_id IS NOT NULL LIMIT 2`
  ]);
  if(grant.length!==1||grant[0].converted_at==null||member.length!==1)
   return new Response("Converted test membership unavailable.",{status:403,headers});
  const expires=String(Date.now()+90_000);
  const url=new URL("/preview-trial/access",target);
  url.searchParams.set("email",email);
  url.searchParams.set("clerk",user.id);
  url.searchParams.set("expires",expires);
  url.searchParams.set("signature",trialBudgetHandoffSignature(email,user.id,expires));
  return Response.redirect(url,302);
 }catch{return new Response("Private Budgeting handoff unavailable.",{status:503,headers});}
}
