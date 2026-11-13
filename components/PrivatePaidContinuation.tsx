"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
type Coach="fitness"|"budgeting"|"life";
type Turn={coach:string;user_message:string;coach_response:string};
const labels:Record<Coach,string>={fitness:"Fitness Coach",budgeting:"Budgeting Coach",life:"Life Coach"};
export default function PrivatePaidContinuation({initial}:{initial:Turn[]}){
 const [coach,setCoach]=useState<Coach>("fitness");
 const [turns,setTurns]=useState<Turn[]>(initial);
 const [message,setMessage]=useState("");
 const [pending,setPending]=useState<{key:string;coach:Coach;message:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const bottom=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{bottom.current?.scrollIntoView({block:"nearest"});},[turns]);
 async function send(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!message.trim())return;
  const text=message.trim();
  const key=pending&&pending.message===text&&pending.coach===coach
   ?pending.key:"paid-"+crypto.randomUUID();
  setPending({key,coach,message:text});setBusy(true);setError("");
  try{
   const response=await fetch("/api/isolated-introductory-trial/paid-chat",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({coach,message:text,requestKey:key})
   });
   const result=await response.json();
   if(!response.ok)throw Error(String(result.error||"Paid chat unavailable"));
   setTurns(t=>[...t,{coach,user_message:text,coach_response:String(result.response||"")}]);
   setMessage("");setPending(null);
  }catch(e){setError(e instanceof Error?e.message:"Paid chat unavailable");}
  finally{setBusy(false);}
 }
 return <section style={{marginTop:28,paddingTop:18,borderTop:"1px solid #999"}}>
  <h2>Continue coaching — private TEST membership</h2>
  <p>This uses your verified Stripe TEST subscription and one shared paid allowance. No real charge is made here.</p>
  <nav aria-label="Paid coach" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   {(["fitness","budgeting","life"] as Coach[]).map(c=>
    <button key={c} type="button" aria-pressed={coach===c} onClick={()=>setCoach(c)}
     style={{padding:10,border:"1px solid #999",borderRadius:8,fontWeight:coach===c?700:400}}>{labels[c]}</button>)}
  </nav>
  <section role="log" aria-live="polite" style={{border:"1px solid #999",borderRadius:12,padding:16,marginTop:15,maxHeight:420,overflowY:"auto"}}>
   {turns.filter(t=>t.coach===coach).map((turn,i)=>
    <article key={i} style={{marginBottom:16,whiteSpace:"pre-wrap"}}>
     <p><strong>You:</strong> {turn.user_message}</p>
     <p><strong>Coach:</strong> {turn.coach_response}</p>
    </article>)}
   {!turns.some(t=>t.coach===coach)&&<p>No paid coaching messages yet. Your saved trial messages remain above.</p>}
   <div ref={bottom}/>
  </section>
  <form onSubmit={send} style={{display:"flex",gap:8,marginTop:12}}>
   <input aria-label="Message coach" value={message} maxLength={6000}
    onChange={e=>setMessage(e.target.value)} disabled={busy} placeholder="Ask your coach…"
    style={{flex:1,minWidth:0,padding:12}}/>
   <button disabled={busy||!message.trim()} type="submit" style={{padding:"10px 18px"}}>
    {busy?"Sending…":"Send"}</button>
  </form>
  {error&&<p role="alert">{error} Do not create another checkout or resend uncertain messages.</p>}
 </section>;
}
