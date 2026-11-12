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
  const [savingFitness,setSavingFitness]=useState(false);
  const [fitnessStatus,setFitnessStatus]=useState("");
  const [fitnessAttempted,setFitnessAttempted]=useState(false);
  const [priorFitnessAttempt,setPriorFitnessAttempt]=useState<string|null>(null);
  const [fitnessRecordChecked,setFitnessRecordChecked]=useState(false);
  const [postAccessReady,setPostAccessReady]=useState(false);
  const [postAccessChecked,setPostAccessChecked]=useState(false);
  const [postAccessAttempted,setPostAccessAttempted]=useState(false);
  const [postAccessSaving,setPostAccessSaving]=useState(false);
  const [postAccessStatus,setPostAccessStatus]=useState("");
  const [registeringPickaxe,setRegisteringPickaxe]=useState(false);
  const [pickaxeRegistrationStatus,setPickaxeRegistrationStatus]=useState("");
  const [savingGoal,setSavingGoal]=useState(false);
  const [goalStatus,setGoalStatus]=useState("");
  async function saveAndVerifyFitness(){
   if(savingFitness||fitnessAttempted||priorFitnessAttempt||!fitnessRecordChecked)return;
   setFitnessAttempted(true);setSavingFitness(true);setFitnessStatus("");
   try{
    const response=await fetch("/api/isolated-introductory-trial/native-fitness-save",{
     method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store"
    });
    const result=await response.json();
    if(response.ok&&result.verified===true&&result.savedPlanVerified===true){
      setFitnessStatus("PASS: a real native Fitness workout was saved and reopened for the isolated test account. One test membership message was used.");
    }else{
      setFitnessStatus(String(result.error||"Workout not verified. Do not retry; the one-time attempt needs review."));
    }
    const updated=await fetch("/api/isolated-introductory-trial/native-readback",{cache:"no-store"});
    if(updated.ok){const next=await updated.json();if(next.ok===true)setData(next);}
   }catch{
    setFitnessStatus("The test result could not be confirmed. Do not retry; check the one-time attempt before another AI call.");
   }finally{setSavingFitness(false);}
  }
  async function runPostAccessSave(){
   if(!postAccessReady||postAccessAttempted||postAccessSaving)return;
   setPostAccessAttempted(true);setPostAccessSaving(true);setPostAccessReady(false);
   setPostAccessStatus("Running one verified Fitness save/readback. Do not refresh or retry this request.");
   try{
    const res=await fetch("/api/isolated-introductory-trial/native-fitness-post-access-group",{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store"
    });
    const result=await res.json();
    if(res.ok&&result.savedPlanVerified===true&&result.verified===true)
      setPostAccessStatus("PASS: native Fitness workout saved and independently reopened for the dedicated test account. Both previous uncertain attempts remain preserved. Fitness save verification completed.");
    else setPostAccessStatus("Not verified. "+String(result.error||"Provider result unresolved.")+" Do not click again.");
    const updated=await fetch("/api/isolated-introductory-trial/native-readback",{cache:"no-store"});
    if(updated.ok){const next=await updated.json();if(next.ok===true)setData(next);}
   }catch{
    setPostAccessStatus("Result unavailable. The attempt may have run; do not click again.");
   }finally{setPostAccessSaving(false);}
  }
  async function registerPickaxeTestIdentity(){
   if(registeringPickaxe)return;
   setRegisteringPickaxe(true);setPickaxeRegistrationStatus("");
   try{
    const response=await fetch("/api/isolated-introductory-trial/fitness-pickaxe-register",{
     method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store"
    });
    const result=await response.json();
    if(!response.ok||result.registered!==true)throw Error(String(result.error||"Pickaxe registration could not be verified"));
    setPickaxeRegistrationStatus("PASS: dedicated test identity verified in Pickaxe Studio. The previous uncertain workout save stays locked. No AI message was used.");
   }catch(e){setPickaxeRegistrationStatus(e instanceof Error?e.message:"Pickaxe registration unavailable");}
   finally{setRegisteringPickaxe(false);}
  }
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
  fetch("/api/isolated-introductory-trial/native-fitness-post-access-group",{cache:"no-store"})
   .then(async response=>{const result=await response.json();if(!response.ok||result.ok!==true)throw Error(String(result.error||"Registration preflight unavailable"));return result;})
   .then(result=>{
    if(!active)return;
    setPostAccessChecked(true);
    setPostAccessReady(result.ready===true);
    if(result.newAttemptStatus){
      setPostAccessAttempted(true);
      setPostAccessStatus(result.newAttemptStatus==="completed"
       ?"Post-fix attempt completed. Check saved Fitness plan before marking PASS."
       :"Post-fix attempt is "+String(result.newAttemptStatus)+". Do not retry.");
    }else if(result.savedPlanFound){
      setPostAccessStatus("A saved plan already exists. No new test will be started.");
    }else if(!result.ready){
      setPostAccessStatus("Post-access-group save is not safe to start. No AI message was used.");
    }
   })
   .catch(e=>{if(active){setPostAccessChecked(true);setPostAccessReady(false);setPostAccessStatus(e instanceof Error?e.message:"Preflight failed");}});
  return()=>{active=false;};
 },[isLoaded,isSignedIn]);
 useEffect(()=>{
  if(!isLoaded||!isSignedIn)return;
  let active=true;
  fetch("/api/isolated-introductory-trial/native-fitness",{cache:"no-store"})
   .then(async response=>{if(!response.ok)throw Error("Fitness status unavailable");return response.json();})
   .then(result=>{
    if(!active)return;
    if(result.fitnessSaveAttemptStatus){
      setPriorFitnessAttempt(String(result.fitnessSaveAttemptStatus));
      setFitnessAttempted(true);
      setFitnessStatus(result.fitnessSaveAttemptStatus==="completed"
       ? "A prior Fitness save attempt was completed. Inspect the saved plan before claiming success."
       : "Previous Fitness test recorded as "+String(result.fitnessSaveAttemptStatus)+". The provider returned HTTP 404; no workout save was verified. Do not retry.");
    }
    setFitnessRecordChecked(true);
   }).catch(()=>{if(active){setFitnessStatus("Could not verify the prior Fitness attempt. No new test can be started safely.");setFitnessRecordChecked(false);}});
  return()=>{active=false;};
 },[isLoaded,isSignedIn]);
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
 const sectionStyle={border:"1px solid #d8d3de",borderRadius:14,padding:"18px",margin:"16px 0",background:"#faf8fd",color:"#262032"} as const;
 return <main style={{maxWidth:750,margin:"2rem auto",padding:"1rem",fontFamily:"system-ui, sans-serif",lineHeight:1.55,color:"#f7f4fc"}}>
  <p style={{fontSize:13,fontWeight:700,letterSpacing:".04em",color:"#60466f"}}>PRIVATE TEST • ISOLATED DATABASE</p>
  <h1 style={{fontSize:"clamp(1.7rem, 4vw, 2.3rem)",marginBottom:8}}>Saved coaching verification</h1>
  <p>Review the saved results for your isolated test account. Read-only checks do not use AI messages. The optional one-time native Fitness save uses one message from the existing Stripe TEST membership, with no new checkout or live charge.</p>
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
    <section style={sectionStyle} aria-label="Fitness native workout readback">
     <h2 style={{marginTop:0}}>Fitness: check saved workout storage</h2>
     <p>This private read-only check looks for your own workout in Pickaxe memory and the isolated database. It does not generate or save a workout, use AI credits or establish save-action parity.</p>
     <a style={secondaryStyle} href="/api/isolated-introductory-trial/native-fitness">Check Fitness workout readback</a>
     <p>To investigate the later HTTP 500 without another AI message, use the read-only Fitness access diagnostic. It checks the test user, required access group and deployed API identity without modifying any access settings.</p>
     <a style={secondaryStyle} href="/api/isolated-introductory-trial/fitness-access-diagnostic">Check Pickaxe Fitness access (read-only)</a>
     <p>Pickaxe confirmed the prior 404 was caused by the test account not being registered in Studio. You can register this dedicated test account without granting a paid Pickaxe access group or consuming an AI message. This does not unlock or repeat the failed workout save.</p>
     <button type="button" style={{...secondaryStyle,opacity:registeringPickaxe?0.6:1}} disabled={registeringPickaxe} onClick={registerPickaxeTestIdentity}>
      {registeringPickaxe?"Registering test identity…":"Register test identity in Pickaxe"}
     </button>
     {pickaxeRegistrationStatus&&<p role="status" style={{color:"#4a2033",fontWeight:650}}>{pickaxeRegistrationStatus}</p>}
     <p>A one-time test may use one TEST membership message. Existing attempts are locked against repeats; no new test should be started after an uncertain provider response.</p>
     <button type="button" style={{...actionStyle,opacity:savingFitness||fitnessAttempted?0.6:1}}
      disabled={savingFitness||fitnessAttempted||!!priorFitnessAttempt||!fitnessRecordChecked||data.native.fitnessPlan} onClick={saveAndVerifyFitness}>
      {savingFitness?"Saving and verifying…":priorFitnessAttempt?"Fitness test already attempted":!fitnessRecordChecked?"Checking prior attempt…":"Save and verify one Fitness workout"}
     </button>
     {fitnessStatus&&<p role="status" style={{color:"#4a2033",fontWeight:650}}>{fitnessStatus}</p>}
     <div style={{borderTop:"1px solid #d8d3de",paddingTop:16,marginTop:16}}>
      <h3>Final Fitness verification after access fix</h3>
      <p>Both earlier attempts (404 and 500) remain locked with their reservation records preserved. Pickaxe confirmed the HTTP 500 used no Pickaxe credits. The dedicated test user now has the correct Fitness access group. This is one new, distinct request using at most one TEST membership message to save and reopen a 15-minute workout. No new checkout or production changes.</p>
      <button type="button" style={{...actionStyle,opacity:!postAccessReady||postAccessAttempted||postAccessSaving?0.6:1}}
       disabled={!postAccessChecked||!postAccessReady||postAccessAttempted||postAccessSaving}
       onClick={runPostAccessSave}>
       {postAccessSaving?"Running save and readback…":postAccessAttempted?"Post-access-group test already attempted":!postAccessChecked?"Checking Pickaxe registration and wallet…":"Run one post-fix Fitness save/readback"}
      </button>
      {postAccessStatus&&<p role="status" style={{color:"#4a2033",fontWeight:650}}>{postAccessStatus}</p>}
     </div>
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
