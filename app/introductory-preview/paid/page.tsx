/**
 * PR #251: authenticated, read-only post-conversion history for the synthetic
 * test account only. No payment initiation or live membership access.
 */
import {currentUser} from "@clerk/nextjs/server";
import {SignIn} from "@clerk/nextjs";
import {introHistorySql,readTrialTurns} from "@/lib/isolatedTrialHistory";
import {isolatedTrialPreviewEnabled} from "@/lib/isolatedIntroductoryIdentity";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
export const dynamic="force-dynamic";
const labels:Record<string,string>={fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"};

export default async function IsolatedConvertedHistory(){
 let turns:Awaited<ReturnType<typeof readTrialTurns>>=[];
 let status:"ready"|"sign_in"|"wrong_account"|"unavailable"="unavailable";
 if(!isolatedTrialPreviewEnabled()){
  status="unavailable";
 }else{
  try{
   const user=await currentUser();
   const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
   if(!user||primary?.verification?.status!=="verified"){
    status="sign_in";
   }else{
    const email=primary.emailAddress.trim().toLowerCase();
    const sql=await introHistorySql();
    const [grants,members]=await Promise.all([
     sql`SELECT converted_at FROM public.introductory_trial_grants
      WHERE clerk_user_id=${user.id} LIMIT 1`,
     sql`SELECT access_active,stripe_status FROM public.fitness_memberships
      WHERE clerk_user_id=${user.id} AND email=${email}
       AND stripe_customer_id IS NOT NULL AND stripe_subscription_id IS NOT NULL LIMIT 1`
    ]);
    if(grants.length!==1||grants[0].converted_at==null||
       members.length!==1||members[0].access_active!==true||
       !["active","trialing"].includes(String(members[0].stripe_status))){
     status="wrong_account";
    }else{
     turns=await readTrialTurns(user.id);
     status="ready";
    }
   }
  }catch{
   status="unavailable";
  }
 }
 return <main style={{maxWidth:780,margin:"3rem auto",padding:"1rem"}}>
  <p>Private trial — simulated billing only</p>
  <h1>{status==="ready"?"Your saved coaching conversations":status==="sign_in"?"Sign in to view saved conversations":status==="wrong_account"?"Test membership not found for this login":"History temporarily unavailable"}</h1>
  {status==="ready"&&<>
   <p>Converted test membership verified. {turns.length} saved conversations are available below. This is a read-only test view, not the public paid coach experience.</p>
   {turns.length===0&&<p>No saved conversations were found.</p>}
   {turns.map((t,i)=><section key={i} style={{border:"1px solid #999",borderRadius:12,padding:16,marginBottom:16,whiteSpace:"pre-wrap"}}>
    <h2>{labels[String(t.coach)]||"Coach"}</h2>
    <p><strong>You:</strong> {String(t.user_message)}</p>
    <p><strong>Coach:</strong> {cleanLifeCoachText(String(t.coach_response))}</p>
   </section>)}
  </>}
  {status==="sign_in"&&<>
   <p>Use the same test login that completed the simulated checkout. No new account or payment is required.</p>
   <SignIn routing="hash" forceRedirectUrl="/introductory-preview/paid" />
  </>}
  {status==="wrong_account"&&<p>This signed-in account does not match the converted test membership. Use the original trial test account; do not start another checkout.</p>}
  {status==="unavailable"&&<p>We could not safely check the private test membership. Your existing payment and saved conversations have not been changed. Do not repeat checkout.</p>}
  <p><a href="/introductory-preview">Return to private trial</a></p>
 </main>;
}
