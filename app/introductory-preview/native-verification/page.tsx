"use client";
import {SignIn,useUser} from "@clerk/nextjs";
import {useEffect,useState} from "react";
import Link from "next/link";
type Data={
 ok:true;mode:"isolated-preview";trial:{fitness:number;budgeting:number;life:number};
 paidContinuation:{recordedTurns:number;converted:boolean;linkedTestMembership:boolean};
 native:{fitnessPlan:boolean;budgetMonths:number;budgetChatTurns:number;lifeGoalStatements:number}
};
export default function NativeReadbackPage(){
 const {isLoaded,isSignedIn}=useUser();
 const [data,setData]=useState<Data|null>(null);
 const [state,setState]=useState("Checking the isolated test account…");
  const [savingGoal,setSavingGoal]=useState(false);
  const [goalStatus,setGoalStatus]=useState("");
  async function verifyNativeLifeGoal(){
   if(savingGoal)return;
   setSavingGoal(true);setGoalStatus("");
   try{
    const response=await fetch("/api/isolated-introductory-trial/native-life-goal",{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store"
    });
    const body=await response.json();
    if(!response.ok||body.verified!==true)
      throw Error(String(body.error||"Goal verification failed"));
    setGoalStatus("Verified: your example goal was saved and read back from native Life Coach storage.");
    const updated=await fetch("/api/isolated-introductory-trial/native-readback",{cache:"no-store"});
    if(updated.ok){const next=await updated.json();if(next.ok===true)setData(next);}
   }catch(e){setGoalStatus(e instanceof Error?e.message:"Goal verification failed");}
   finally{setSavingGoal(false);}
  }

 useEffect(()=>{
  if(!isLoaded||!isSignedIn)return;
  let active=true;
  fetch("/api/isolated-introductory-trial/native-readback",{cache:"no-store"})
   .then(async r=>{const body=await r.json();if(!r.ok||body.ok!==true)throw Error(body.error||"Verification unavailable");return body as Data;})
   .then(v=>{if(active){setData(v);setState("");}})
   .catch(e=>{if(active)setState(e instanceof Error?e.message:"Verification unavailable");});
  return()=>{active=false;};
 },[isLoaded,isSignedIn]);
 const actionStyle={display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"14px 20px",minHeight:48,borderRadius:10,background:"#6935a0",color:"#fff",fontSize:16,fontWeight:700,textDecoration:"none",border:"2px solid #6935a0",cursor:"pointer"} as const;
 const secondaryStyle={display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"12px 17px",minHeight:44,borderRadius:10,border:"2px solid #6935a0",color:"#6935a0",background:"#fff",fontWeight:650,textDecoration:"none"} as const;
 const sectionStyle={border:"1px solid #d8d3de",borderRadius:14,padding:"18px",margin:"16px 0",background:"#faf8fd"} as const;
 return <main style={{maxWidth:750,margin:"2rem auto",padding:"1rem",fontFamily:"system-ui, sans-serif",lineHeight:1.55}}>
  <p style={{fontSize:13,fontWeight:700,letterSpacing:".04em",color:"#60466f"}}>PRIVATE TEST • ISOLATED DATABASE</p>
  <h1 style={{fontSize:"clamp(1.7rem, 4vw, 2.3rem)",marginBottom:8}}>Saved coaching verification</h1>
  <p>Review the saved results below, then use the clearly labeled test buttons. These checks use your isolated test account. No checkout or AI credits are used.</p>
  {!isLoaded?<p>Checking sign-in…</p>:!isSignedIn?
   <section><p>Sign in using the same Clerk test account you used for the simulated conversion.</p>
    <SignIn routing="hash" forceRedirectUrl="/introductory-preview/native-verification"/>
   </section>:data?<>
    <section style={sectionStyle}><h2 style={{marginTop:0}}>Saved trial conversations</h2>
    <p>Fitness: {data.trial.fitness} · Budgeting: {data.trial.budgeting} · Life: {data.trial.life}</p></section>
    <section style={sectionStyle}><h2 style={{marginTop:0}}>After conversion</h2>
    <p>Converted trial record: {data.paidContinuation.converted?"Found":"Not found"}.</p>
    <p>Test membership link: {data.paidContinuation.linkedTestMembership?"Found":"Not found"}.</p>
    <p>Saved continued-coaching turns: {data.paidContinuation.recordedTurns}.</p></section>
    <section style={sectionStyle}><h2 style={{marginTop:0}}>Native saved-data readback</h2>
    <p>Saved Fitness plan: {data.native.fitnessPlan?"Found":"Not found for this test account"}.</p>
    <p>Budget months: {data.native.budgetMonths}; native Budgeting replies: {data.native.budgetChatTurns}.</p>
    <p>Life goal statements: {data.native.lifeGoalStatements}.</p></section>
    <section style={sectionStyle} aria-label="Budgeting native expense verification">
     <h2 style={{marginTop:0}}>1. Test Budgeting expense saving</h2>
     <p>Opens the private Budgeting test with your existing login. Saves and reopens a $1 test expense in the isolated database.</p>
     <a style={actionStyle} href="/api/isolated-introductory-trial/budget-handoff">Open Budgeting test <span aria-hidden="true" style={{marginLeft:10}}>→</span></a>
    </section>
    <section style={sectionStyle} aria-label="Life Coach native goal verification">
     <h2 style={{marginTop:0}}>2. Test Life Coach goal saving</h2>
     <p>Save one example goal and verify that the native Life Coach store can read it back. This uses your isolated test database, not an AI message.</p>
     <button style={{...secondaryStyle,opacity:savingGoal?0.6:1,cursor:savingGoal?"wait":"pointer"}} type="button" disabled={savingGoal} onClick={verifyNativeLifeGoal}>{savingGoal?"Verifying…":"Save and verify example Life goal"}</button>
     {goalStatus&&<p role="status">{goalStatus}</p>}
    </section>
    <p role="status">These are real reads of the isolated native data tables, not proof of a new save through the production Coach interfaces. An item marked not found may simply not have been created in this test account.</p>
   </>:<p role="status">{state}</p>}
  <nav aria-label="Other private trial pages" style={{borderTop:"1px solid #d8d3de",paddingTop:20,marginTop:24}}>
    <p style={{fontWeight:700,marginTop:0}}>Other test pages</p>
    <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
      <Link style={secondaryStyle} href="/introductory-preview/paid">View test membership →</Link>
      <Link style={secondaryStyle} href="/introductory-preview">Original trial preview →</Link>
    </div>
  </nav>
 </main>;
}
