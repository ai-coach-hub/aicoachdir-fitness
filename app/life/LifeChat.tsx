"use client";
import {FormEvent,useEffect,useRef,useState} from "react";
import styles from "./LifeChat.module.css";
import { cleanLifeCoachText, isLifeCoachSectionHeading } from "@/lib/lifeCoachFormatting";
type Msg={role:"user"|"assistant";text:string};
type Thread={id:string;title:string;updatedAt:string};
const intros=[
 "What's one thing you'd like to make progress on this week?",
 "Want help turning a big goal into a manageable first step?",
 "Is there a habit you'd like to build or change?",
 "What would make today feel more manageable?"
];
function CoachResponse({text}:{text:string}){
 const lines=cleanLifeCoachText(text).split("\n");
 return <span className={styles.coachReply}>
  {lines.map((line,index)=>line
   ? <span key={index} className={isLifeCoachSectionHeading(line)?styles.replyHeading:styles.replyLine}>{line}</span>
   : <span key={index} aria-hidden="true" className={styles.replySpacer}/>)}
 </span>;
}
export default function LifeChat(){
 const [threads,setThreads]=useState<Thread[]>([]);
 const [id,setId]=useState("");
 const [messages,setMessages]=useState<Msg[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const end=useRef<HTMLDivElement>(null);
 const [intro,setIntro]=useState(intros[0]);
 useEffect(()=>setIntro(intros[Math.floor(Math.random()*intros.length)]),[]);
 const loadThreads=async()=>{try{const r=await fetch("/api/life/chat",{cache:"no-store"});const j=await r.json();if(j.ok)setThreads(j.threads||[]);}catch{}};
 useEffect(()=>{void loadThreads();},[]);
 useEffect(()=>{end.current?.scrollIntoView({block:"end",behavior:"smooth"});},[messages,busy]);
 const open=async(nextId:string)=>{if(busy)return;setError("");
  try {
   const r=await fetch("/api/life/chat?id="+encodeURIComponent(nextId),{cache:"no-store"});
   const j=await r.json();
   if(j.ok){setId(nextId);setMessages(j.messages||[]);}
   else setError(j.error||"Could not open this chat.");
  }catch{setError("Could not open this chat.");}
 };
 async function send(e:FormEvent){
  e.preventDefault();const message=input.trim();if(!message||busy)return;
  setBusy(true);setError("");setMessages(a=>[...a,{role:"user",text:message}]);setInput("");
  try{
   const r=await fetch("/api/life/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,...(id?{conversationId:id}:{})})});
   const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Life Coach reply could not be saved.");
   setId(j.conversationId);setMessages(a=>[...a,{role:"assistant",text:j.response}]);await loadThreads();
  }catch(ex){setError(ex instanceof Error?ex.message:"Request failed.");setInput(message);setMessages(a=>a.slice(0,-1));}finally{setBusy(false);}
 }
 return <section className={styles.layout}>
  <aside className={styles.history} aria-label="Previous Life Coach conversations">
   <h3>Previous chats</h3>
   <button className={styles.newButton} type="button" disabled={busy} onClick={()=>{setId("");setMessages([]);setError("");}}>New Chat</button>
   <div className={styles.threadList}>
    {threads.map(t=><button key={t.id} className={styles.threadButton} type="button" disabled={busy} aria-pressed={t.id===id} onClick={()=>void open(t.id)} style={{background:t.id===id?"#1b3440":"#0c1c2b"}}>{t.title}</button>)}
   </div>
  </aside>
  <div className={styles.chatPanel}>
   <h1 style={{margin:0}}>AI Coaching for Life</h1>
   <p style={{color:"var(--muted)",margin:0}}>Private test • goals, habits and accountability</p>
   <div role="log" aria-live="polite" className={styles.messageLog}>
    {!messages.length&&!input.trim()&&<p style={{color:"var(--muted)"}}>{intro}</p>}
    {messages.map((m,i)=><p key={i} className={styles.message} style={{background:m.role==="user"?"#17323b":"#101d2a"}}><strong>{m.role==="user"?"You":"Life Coach"}</strong><span style={{display:"block",marginTop:4}}>{m.role==="assistant"?<CoachResponse text={m.text}/>:m.text}</span></p>)}
    {busy&&<p>Coach is working…</p>}<div ref={end}/>
   </div>
   {error&&<p role="alert" style={{color:"#ffd39d"}}>{error}</p>}
   <form onSubmit={send} className={styles.compose}>
    <input aria-label="Message Life Coach" placeholder="Tell me what you'd like to work on…" value={input} onChange={e=>setInput(e.target.value)} maxLength={6000}/>
    <button disabled={busy||!input.trim()} type="submit" className="primary-button">Send</button>
   </form>
  </div>
 </section>;
}
