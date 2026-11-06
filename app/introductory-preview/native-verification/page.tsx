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
 return <main style={{maxWidth:750,margin:"3rem auto",padding:"1rem"}}>
  <p>Private trial • isolated test branch • optional Life goal verification</p>
  <h1>Saved coaching verification</h1>
  <p>This page checks your existing test account records. The optional Life goal button saves one example only to the isolated database. It does not create a trial, consume AI messages, create workouts, change budgets, or start checkout.</p>
  {!isLoaded?<p>Checking sign-in…</p>:!isSignedIn?
   <section><p>Sign in using the same Clerk test account you used for the simulated conversion.</p>
    <SignIn routing="hash" forceRedirectUrl="/introductory-preview/native-verification"/>
   </section>:data?<>
    <h2>Saved trial conversations</h2>
    <p>Fitness: {data.trial.fitness} · Budgeting: {data.trial.budgeting} · Life: {data.trial.life}</p>
    <h2>After conversion</h2>
    <p>Converted trial record: {data.paidContinuation.converted?"Found":"Not found"}.</p>
    <p>Test membership link: {data.paidContinuation.linkedTestMembership?"Found":"Not found"}.</p>
    <p>Saved continued-coaching turns: {data.paidContinuation.recordedTurns}.</p>
    <h2>Native saved-data readback</h2>
    <p>Saved Fitness plan: {data.native.fitnessPlan?"Found":"Not found for this test account"}.</p>
    <p>Budget months: {data.native.budgetMonths}; native Budgeting replies: {data.native.budgetChatTurns}.</p>
    <p>Life goal statements: {data.native.lifeGoalStatements}.</p>
    <section aria-label="Life Coach native goal verification">
     <h3>Test native Life Coach goal saving</h3>
     <p>Save one example goal and verify that the native Life Coach store can read it back. This uses your isolated test database, not an AI message.</p>
     <button type="button" disabled={savingGoal} onClick={verifyNativeLifeGoal}>{savingGoal?"Verifying…":"Save and verify example Life goal"}</button>
     {goalStatus&&<p role="status">{goalStatus}</p>}
    </section>
    <p role="status">These are real reads of the isolated native data tables, not proof of a new save through the production Coach interfaces. An item marked not found may simply not have been created in this test account.</p>
   </>:<p role="status">{state}</p>}
  <p><Link href="/introductory-preview/paid">Previously verified test membership</Link> · <Link href="/introductory-preview">Original trial preview</Link></p>
 </main>;
}
