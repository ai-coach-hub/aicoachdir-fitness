/**
 * Private converted test dashboard: read-only display of the same history
 * from the trial branch. No production coaches or billing actions.
 */
import Link from "next/link";
import {readTrialTurns} from "@/lib/isolatedTrialHistory";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";

const names:Record<string,string>={fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"};
const order=["fitness","budgeting","life"] as const;

export default async function ConvertedTrialDashboard({firstName,userId}:{firstName:string;userId:string}){
 const turns=await readTrialTurns(userId);
 return <main style={{maxWidth:1040,margin:"2rem auto",padding:"1.5rem"}}>
  <p style={{fontSize:13}}>PRIVATE TEST ONLY — SIMULATED BILLING</p>
  <h1>Welcome back{firstName?", "+firstName:""}</h1>
  <p>Your test membership is active. All saved conversations from your introductory trial are available below. This is a read-only test dashboard, not the public paid coach experience.</p>
  <nav aria-label="Saved coaches" style={{display:"flex",gap:12,flexWrap:"wrap",margin:"24px 0"}}>
   {order.map(coach=><a key={coach} href={"#saved-"+coach} style={{border:"1px solid #999",borderRadius:12,padding:"12px 18px"}}>{names[coach]}</a>)}
  </nav>
  {order.map(coach=><section id={"saved-"+coach} key={coach} style={{margin:"30px 0"}}>
   <h2>{names[coach]}</h2>
   {turns.filter(t=>t.coach===coach).length===0?<p>No saved trial conversations for this coach.</p>:
    turns.filter(t=>t.coach===coach).map((t,i)=><article key={i} style={{padding:18,border:"1px solid #999",borderRadius:12,marginTop:12,whiteSpace:"pre-wrap"}}>
     <p><strong>You:</strong> {String(t.user_message)}</p>
     <p><strong>Coach:</strong> {cleanLifeCoachText(String(t.coach_response))}</p>
    </article>)}
  </section>)}
  <footer style={{paddingTop:20,borderTop:"1px solid #999"}}>
   <p>These saved messages are available for review. Continued coaching through the normal paid chat pages has not yet been connected in this test.</p>
   <Link href="/introductory-preview/paid">Open the standalone saved-history view</Link>
  </footer>
 </main>;
}
