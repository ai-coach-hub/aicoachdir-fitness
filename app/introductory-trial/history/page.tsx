import {currentUser} from "@clerk/nextjs/server";
import {SignIn} from "@clerk/nextjs";
import Link from "next/link";
import {notFound} from "next/navigation";
import {sharedUsageMemberKey} from "@/lib/sharedUsageMemberIdentity";
import {productionTrialHistorySql,readPublicTrialTurns} from "@/lib/publicIntroductoryTrialLedger";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
export const dynamic="force-dynamic";
const labels:Record<string,string>={fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"};
export default async function PublicTrialHistoryPage(){
 if(process.env.VERCEL_ENV!=="production"||
    process.env.PUBLIC_INTRO_TRIAL_SCHEMA_READY!=="true")notFound();
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 if(!user||primary?.verification?.status!=="verified")
  return <main style={{maxWidth:750,margin:"3rem auto",padding:16}}>
   <h1>Sign in for your saved trial conversations</h1>
   <SignIn routing="hash" forceRedirectUrl="/introductory-trial/history"/>
  </main>;
 const member=sharedUsageMemberKey(primary.emailAddress.trim().toLowerCase(),
  String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||""));
 if(!member)return <main><p>Conversation ownership could not be verified.</p></main>;
 let turns:Awaited<ReturnType<typeof readPublicTrialTurns>>=[];
 try{
  const sql=await productionTrialHistorySql();
  const grant=await sql`SELECT 1 FROM public.introductory_trial_grants
  WHERE clerk_user_id=${user.id} AND member_key=${member} LIMIT 1`;
  if(grant.length!==1)return <main style={{padding:24}}><h1>No introductory conversations for this account</h1>
   <Link href="/dashboard">Member Dashboard</Link></main>;
  turns=await readPublicTrialTurns(user.id,member);
 }catch{
  return <main style={{padding:24}}><h1>Saved conversations are temporarily unavailable</h1>
   <p>Your conversations have not been deleted.</p></main>;
 }
 return <main style={{maxWidth:750,margin:"2rem auto",padding:16}}>
  <h1>Your introductory conversations</h1>
  <p>These messages remain saved under your verified account after any membership change.</p>
  {turns.length===0&&<p>No completed trial messages yet.</p>}
  {turns.map((t,i)=><article key={i} style={{border:"1px solid #999",padding:16,borderRadius:10,marginBottom:12,whiteSpace:"pre-wrap"}}>
   <h2>{labels[String(t.coach)]||"Coach"}</h2>
   <p><strong>You:</strong> {String(t.user_message)}</p>
   <p><strong>Coach:</strong> {String(t.coach)==="life"?cleanLifeCoachText(String(t.coach_response)):String(t.coach_response)}</p>
  </article>)}
  <p><Link href="/dashboard">Member Dashboard</Link></p>
 </main>;
}
