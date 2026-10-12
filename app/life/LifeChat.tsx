"use client";
import {FormEvent,useEffect,useRef,useState} from "react";
type Msg={role:"user"|"assistant";text:string};
type Thread={id:string;title:string;updatedAt:string};
const intros=[
 "What's one thing you'd like to make progress on this week?",
 "Want help turning a big goal into a manageable first step?",
 "Is there a habit you'd like to build or change?",
 "What would make today feel more manageable?"
];
export default function LifeChat(){
 const [threads,setThreads]=useState<Thread[]>([]);
 const [id,setId]=useState("");
 const [messages,setMessages]=useState<Msg[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const end=useRef<HTMLDivElement>(null);
 const [intro]=useState(()=>intros[Math.floor(Math.random()*intros.length)]);
 const loadThreads=async()=>{try{const r=await fetch("/api/life/chat",{cache:"no-store"});const j=await r.json();if(j.ok)setThreads(j.threads||[]);}catch{}};
 useEffect(()=>{void loadThreads();},[]);
 useEffect(()=>{end.current?.scrollIntoView({block:"end",behavior:"smooth"});},[messages,busy]);
 const open=async(nextId:string)=>{if(busy)return;setError("");const r=await fetch("/api/life/chat?id="+encodeURIComponent(nextId));const j=await r.json();if(j.ok){setId(nextId);setMessages(j.messages||[]);}else setError(j.error||"Could not open this chat.");};
 async function send(e:FormEvent){
  e.preventDefault();const message=input.trim();if(!message||busy)return;
  setBusy(true);setError("");setMessages(a=>[...a,{role:"user",text:message}]);setInput("");
  try{
   const r=await fetch("/api/life/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,...(id?{conversationId:id}:{})})});
   const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Life Coach reply could not be saved.");
   setId(j.conversationId);setMessages(a=>[...a,{role:"assistant",text:j.response}]);await loadThreads();
  }catch(ex){setError(ex instanceof Error?ex.message:"Request failed.");setInput(message);setMessages(a=>a.slice(0,-1));}finally{setBusy(false);}
 }
 return <section style={{marginTop:24,display:"grid",gridTemplateColumns:"minmax(180px,260px) minmax(0,1fr)",gap:20}}>
  <aside style={{padding:16,border:"1px solid var(--border)",borderRadius:18}}>
   <h3>Previous chats</h3>
   <button type="button" onClick={()=>{setId("");setMessages([]);setError("");}} style={{marginBottom:12,padding:10,borderRadius:10}}>New Chat</button>
   {threads.map(t=><button key={t.id} type="button" onClick={()=>void open(t.id)} style={{display:"block",width:"100%",textAlign:"left",padding:10,marginBottom:7,borderRadius:9,background:t.id===id?"#1b3440":"#0c1c2b",color:"white",border:"1px solid #2b4055"}}>{t.title}</button>)}
  </aside>
  <div style={{border:"1px solid var(--border)",borderRadius:18,padding:20,minHeight:"70vh",display:"flex",flexDirection:"column",gap:12}}>
   <h1 style={{fontSize:30,margin:0}}>AI Coaching for Life</h1>
   <p style={{color:"var(--muted)",margin:0}}>Private test • goals, habits and accountability</p>
   <div role="log" aria-live="polite" style={{flex:1,overflowY:"auto",minHeight:250,maxHeight:"60vh"}}>
    {!messages.length&&<p style={{color:"var(--muted)"}}>{intro}</p>}
    {messages.map((m,i)=><p key={i} style={{whiteSpace:"pre-wrap",lineHeight:1.6,padding:12,background:m.role==="user"?"#17323b":"#101d2a",borderRadius:12}}><strong>{m.role==="user"?"You":"Life Coach"}</strong><span style={{display:"block",marginTop:4}}>{m.text}</span></p>)}
    {busy&&<p>Coach is working…</p>}<div ref={end}/>
   </div>
   {error&&<p role="alert" style={{color:"#ffd39d"}}>{error}</p>}
   <form onSubmit={send} style={{display:"flex",gap:10}}>
    <input aria-label="Message Life Coach" placeholder="Tell me what you'd like to work on…" value={input} onChange={e=>setInput(e.target.value)} maxLength={6000} style={{flex:1,minWidth:0,borderRadius:12,padding:14}}/>
    <button disabled={busy||!input.trim()} type="submit" className="primary-button">Send</button>
   </form>
  </div>
 </section>;
}
