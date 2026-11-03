"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {SignIn,useUser} from "@clerk/nextjs";
import {cleanLifeCoachText} from "@/lib/lifeCoachFormatting";
type Coach="fitness"|"budgeting"|"life";
type Message={coach:Coach;role:"user"|"assistant";text:string};
const labels:Record<Coach,string>={fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"};
export default function IntroductoryPreview(){
 const {isLoaded,isSignedIn}=useUser();
 const [ready,setReady]=useState<"loading"|"eligible"|"unavailable">("loading");
 const [coach,setCoach]=useState<Coach>("fitness");
 const [messages,setMessages]=useState<Message[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [exhausted,setExhausted]=useState(false);
 const [pending,setPending]=useState<{coach:Coach;message:string;key:string}|null>(null);
 const bottom=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{if(!isLoaded||!isSignedIn)return;let alive=true;fetch("/api/isolated-introductory-trial",{cache:"no-store"})
  .then(r=>r.ok?r.json():null).then(v=>{if(alive)setReady(v?.eligible?"eligible":"unavailable");})
  .catch(()=>{if(alive)setReady("unavailable");});return()=>{alive=false;};},[isLoaded,isSignedIn]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"end"});},[messages,busy]);
 useEffect(()=>{
  if(ready!=="eligible")return;
  let active=true;
  fetch("/api/isolated-introductory-trial/history",{cache:"no-store"})
   .then(r=>r.ok?r.json():null)
   .then(v=>{if(!active||!Array.isArray(v?.turns))return;
    setMessages(v.turns.flatMap((t:{coach:Coach;user_message:string;coach_response:string})=>[
     {coach:t.coach,role:"user" as const,text:t.user_message},
     {coach:t.coach,role:"assistant" as const,text:t.coach_response}
    ]));
   }).catch(()=>{});
  return()=>{active=false;};
 },[ready]);
 async function send(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||ready!=="eligible"||exhausted)return;
  const message=input.trim();if(!message)return;
  const key=(pending?.coach===coach&&pending.message===message)?pending.key:`trial-${crypto.randomUUID()}`;
  setPending({coach,message,key});setBusy(true);setError("");
  try{
   const r=await fetch("/api/isolated-introductory-trial/chat",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({coach,message,requestKey:key})
   });
   const result=await r.json();
   if(!r.ok){if(r.status===429)setExhausted(true);throw Error(String(result.error||"Trial chat unavailable"));}
   setMessages(prev=>[...prev,{coach,role:"user",text:message},
      {coach,role:"assistant",text:String(result.response||"")}]);
   setInput("");setPending(null);
  }catch(e){setError(e instanceof Error?e.message:"Trial chat unavailable");}
  finally{setBusy(false);}
 }
 return <main style={{maxWidth:760,margin:"3rem auto",padding:"1rem",fontFamily:"inherit"}}>
  <p style={{fontSize:13,opacity:.7}}>Private trial preview — not a public membership</p>
  <h1>Try the AI Coaches</h1>
  <p>One introductory allowance of 15 messages shared across Fitness, Budgeting, and Life Coaching.</p>
  {!isLoaded?<p>Checking sign-in…</p>:
   !isSignedIn?<section><p>Sign in with your existing verified test account. No payment is required.</p><SignIn routing="hash" forceRedirectUrl="/introductory-preview" /></section>:
   ready==="loading"?<p>Verifying your preview account…</p>:
   ready==="unavailable"?<p role="alert">This preview is not available for this account. Production memberships are unchanged.</p>:
   <>
    <nav aria-label="Choose coach" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
     {(["fitness","budgeting","life"] as Coach[]).map(c=><button key={c} type="button" onClick={()=>setCoach(c)}
      aria-pressed={c===coach} style={{padding:"10px 14px",borderRadius:9,border:"1px solid currentColor",fontWeight:c===coach?700:400}}>
      {labels[c]}</button>)}
    </nav>
    <section aria-label={labels[coach]+" messages"} role="log" aria-live="polite"
      style={{minHeight:240,maxHeight:440,overflowY:"auto",border:"1px solid #999",borderRadius:12,padding:16}}>
     {messages.filter(m=>m.coach===coach).map((m,i)=><p key={i} style={{marginBottom:12}}>
      <strong>{m.role==="user"?"You":labels[m.coach]}:</strong> {m.role==="assistant"?cleanLifeCoachText(m.text):m.text}</p>)}
     {!messages.some(m=>m.coach===coach)&&<p>Ask {labels[coach]} a question to begin.</p>}
     <div ref={bottom}/>
    </section>
    <form onSubmit={send} style={{display:"flex",gap:8,marginTop:14}}>
     <input aria-label="Message coach" value={input} onChange={e=>setInput(e.target.value)} maxLength={6000}
      disabled={busy||exhausted} placeholder="Ask your coach…" style={{flex:1,padding:12,minWidth:0}}/>
     <button type="submit" disabled={busy||exhausted||!input.trim()} style={{padding:"10px 20px"}}>{busy?"Sending…":"Send"}</button>
    </form>
    {error&&<p role="alert">{error} {pending&&!exhausted?"Do not resend this message until support verifies the result.":""}</p>}
    {exhausted&&<p role="status">Your introductory allowance has been used. You can review membership options.</p>}
   </>
  }
 </main>;
}
