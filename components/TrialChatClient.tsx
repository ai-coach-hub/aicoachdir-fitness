"use client";
import {SignIn,useUser} from "@clerk/nextjs";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
type Coach="fitness"|"budgeting"|"life";
type Turn={coach:Coach;user_message:string;coach_response:string};
type Message={coach:Coach;role:"user"|"assistant";text:string};
const labels:Record<Coach,string>={fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"};
type Stage="loading"|"offer"|"active"|"unavailable";
export default function TrialChatClient(){
 const {isLoaded,isSignedIn}=useUser();
 const [stage,setStage]=useState<Stage>("loading");
 const [reason,setReason]=useState("");
 const [coach,setCoach]=useState<Coach>("fitness");
 const [messages,setMessages]=useState<Message[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false),[enrolling,setEnrolling]=useState(false);
 const [exhausted,setExhausted]=useState(false),[error,setError]=useState("");
 const [pending,setPending]=useState<{coach:Coach;message:string;key:string}|null>(null);
 const bottom=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{
  if(!isLoaded||!isSignedIn)return;
  let live=true;
  fetch("/api/introductory-trial/preflight",{cache:"no-store"})
   .then(async r=>({status:r.status,data:await r.json()}))
   .then(({data})=>{if(!live)return;
    if(data?.eligible&&data.kind==="resume")setStage("active");
    else if(data?.eligible&&data.kind==="new")setStage("offer");
    else{setStage("unavailable");setReason(String(data?.reason||"verification_unavailable"));}
   }).catch(()=>{if(live){setStage("unavailable");setReason("verification_unavailable");}});
  return()=>{live=false;};
 },[isLoaded,isSignedIn]);
 useEffect(()=>{
  if(stage!=="active")return;
  let alive=true;
  fetch("/api/introductory-trial/history",{cache:"no-store"})
   .then(r=>r.ok?r.json():null)
   .then(data=>{
    if(!alive||!Array.isArray(data?.turns))return;
    const all=data.turns.flatMap((turn:Turn)=>[
     {coach:turn.coach,role:"user" as const,text:String(turn.user_message)},
     {coach:turn.coach,role:"assistant" as const,text:String(turn.coach_response)}
    ]);
    setMessages(all);
    if(data.remaining===0)setExhausted(true);
   }).catch(()=>{});
  return()=>{alive=false;};
 },[stage]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest"});},[messages,busy]);
 async function enroll(){
  if(enrolling)return;setEnrolling(true);setError("");
  try{
   const r=await fetch("/api/introductory-trial/enroll",{method:"POST",cache:"no-store"});
   const result=await r.json();
   if(!r.ok||!result?.trialActive)throw Error(String(result?.error||"Unable to start trial"));
   setStage("active");setExhausted(result.remaining===0);
  }catch(e){setError(e instanceof Error?e.message:"Unable to start trial");}
  finally{setEnrolling(false);}
 }
 async function send(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||stage!=="active"||exhausted)return;
  const message=input.trim();if(!message)return;
  const key=pending?.coach===coach&&pending.message===message?pending.key:"intro-"+crypto.randomUUID();
  setPending({coach,message,key});setBusy(true);setError("");
  try{
   const r=await fetch("/api/introductory-trial/chat",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({coach,message,requestKey:key}),cache:"no-store"
   });
   const result=await r.json();
   if(!r.ok){
    if(r.status===429)setExhausted(true);
    throw Error(String(result?.error||"Trial chat temporarily unavailable"));
   }
   setMessages(m=>[...m,{coach,role:"user",text:message},
      {coach,role:"assistant",text:String(result.response||"")}]);
   setInput("");setPending(null);
  }catch(e){setError(e instanceof Error?e.message:"Trial chat temporarily unavailable");}
  finally{setBusy(false);}
 }
 return <main style={{maxWidth:760,margin:"2rem auto",padding:"1rem"}}>
  <p style={{opacity:.7,fontSize:13}}>AI Coach Directory · Introductory coaching</p>
  <h1>Try your AI Coaches</h1>
  <p>15 total introductory messages shared across Fitness, Budgeting, and Life. No credit card and no automatic charge.</p>
  {!isLoaded?<p>Checking your sign-in…</p>:
   !isSignedIn?<section><p>Sign in using the verified account you created for your introductory coaching.</p>
    <SignIn routing="hash" forceRedirectUrl="/introductory-trial/chat"/>
    <p><Link href="/introductory-trial">Review introductory Terms</Link></p>
   </section>:
   stage==="loading"?<p>Checking your membership eligibility…</p>:
   stage==="unavailable"?<section>
    <p role="status">{reason==="terms_required"?"Please review the free-trial Terms before continuing.":
     reason==="existing_member"?"You already have a membership or historical coaching access.":
     reason==="trial_converted"?"Your introductory trial was converted to a membership.":
     reason==="trial_exhausted"?"Your introductory messages are complete.":
     "Trial eligibility could not be verified. No payment was attempted."}</p>
    <p><Link href="/introductory-trial">Review Trial Terms</Link> · <Link href="/dashboard">Member Dashboard</Link> · <Link href="/introductory-trial/history">Saved trial conversations</Link></p>
   </section>:
   stage==="offer"?<section>
    <p>You're eligible to start your one-time introductory allowance.</p>
    <button type="button" className="primary-button" onClick={enroll} disabled={enrolling}>
     {enrolling?"Starting free coaching…":"Start My Free Coaching"}</button>
    {error&&<p role="alert">{error}</p>}
   </section>:
   <section>
    <nav aria-label="Choose a coach" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
     {(["fitness","budgeting","life"] as const).map(c=><button type="button" key={c}
      aria-pressed={c===coach} onClick={()=>setCoach(c)}
      style={{padding:"10px 14px",borderRadius:8,border:"1px solid currentColor",
       fontWeight:c===coach?700:400}}>{labels[c]}</button>)}
    </nav>
    <section role="log" aria-live="polite" aria-label={labels[coach]+" messages"}
     style={{minHeight:230,maxHeight:470,overflowY:"auto",padding:15,borderRadius:12,border:"1px solid #999"}}>
     {messages.filter(m=>m.coach===coach).map((m,i)=>
      <p key={i} style={{whiteSpace:"pre-wrap",marginBottom:12}}>
       <strong>{m.role==="user"?"You":labels[m.coach]}:</strong>{" "}
       {m.role==="assistant"&&m.coach==="life"?cleanLifeCoachText(m.text):m.text}
      </p>)}
     {!messages.some(m=>m.coach===coach)&&<p>What would you like help with today?</p>}
     <div ref={bottom}/>
    </section>
    <form onSubmit={send} style={{display:"flex",gap:8,marginTop:12}}>
     <input value={input} onChange={e=>setInput(e.target.value)}
      aria-label="Message your coach" placeholder="Ask your coach…"
      maxLength={6000} disabled={busy||exhausted} style={{flex:1,minWidth:0,padding:12}}/>
     <button type="submit" disabled={busy||exhausted||!input.trim()}
      style={{padding:"10px 18px"}}>{busy?"Sending…":"Send"}</button>
    </form>
    {error&&<p role="alert">{error} {pending&&!exhausted?"Please do not resend an uncertain message.":""}</p>}
    {exhausted&&<p role="status">Your introductory messages have been used. Your saved conversations remain available.</p>}
    <section style={{borderTop:"1px solid #999",paddingTop:20,marginTop:24}}>
     <h2>Continue with a membership</h2>
     <p>Choose a paid membership whenever you're ready. No automatic charge occurs when the free messages finish.</p>
     <Link href="/fitness/signup" className="secondary-button">Explore Membership Options</Link>
     <p><Link href="/introductory-trial/history">See My Saved Trial Conversations</Link></p>
    </section>
   </section>}
 </main>;
}
