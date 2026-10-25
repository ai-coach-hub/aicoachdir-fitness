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
export default function LifeChat({privatePreview=false}:{privatePreview?:boolean}){
 const [threads,setThreads]=useState<Thread[]>([]);
 const [historyState,setHistoryState]=useState<"loading"|"ready"|"error">("loading");
 const [id,setId]=useState("");
 const [messages,setMessages]=useState<Msg[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [openingThread,setOpeningThread]=useState(false);
 const [usageTest,setUsageTest]=useState<{active:boolean;remaining:number;used:number;pending:number;limit:number}|null>(null);
 const [startingTest,setStartingTest]=useState(false);
 const [error,setError]=useState("");
  const [availability,setAvailability]=useState<"loading"|"available"|"pending_renewal"|"not_entitled"|"preview"|"unavailable">("loading");
 const end=useRef<HTMLDivElement>(null);
 const pendingRequest=useRef<{key:string;message:string;conversationId:string;newConversationId:string}|null>(null);
 const [intro,setIntro]=useState(intros[0]);
 useEffect(()=>setIntro(intros[Math.floor(Math.random()*intros.length)]),[]);
 const loadThreads=async()=>{try{
  const r=await fetch("/api/life/chat",{cache:"no-store"});
  if(!r.ok)throw Error("History unavailable");
  const j=await r.json();
  if(!j.ok||!Array.isArray(j.threads))throw Error("History unavailable");
  setThreads(j.threads);setHistoryState("ready");
 }catch{setHistoryState("error");}};
 const loadUsage=async()=>{try{
  const r=await fetch("/api/life/usage-test",{cache:"no-store"});
  if(!r.ok)return;
  const j=await r.json();
  if(j.ok)setUsageTest({active:j.active,remaining:j.remaining,used:j.used,pending:j.pending,limit:j.limit});
 }catch{}};
 useEffect(()=>{void loadThreads();if(privatePreview){setAvailability("preview");void loadUsage();return;}
   let alive=true;
   fetch("/api/life/chat?availability=1",{cache:"no-store"})
    .then(async r=>{if(!r.ok)throw Error("unavailable");return r.json();})
    .then(j=>{if(alive)setAvailability(j.availability==="available"||j.availability==="pending_renewal"?j.availability:"not_entitled");})
    .catch(()=>{if(alive)setAvailability("unavailable");});
   return ()=>{alive=false;};
  },[privatePreview]);
 async function startUsageTest(){
  if(startingTest||busy)return;
  setStartingTest(true);setError("");
  try{
   const r=await fetch("/api/life/usage-test",{method:"POST"});
   const j=await r.json();
   if(!r.ok||!j.ok)throw Error(j.error||"Cannot start private test");
   setUsageTest({active:j.active,remaining:j.remaining,used:j.used,pending:j.pending,limit:j.limit});
  }catch(ex){setError(ex instanceof Error?ex.message:"Cannot start private test")}
  finally{setStartingTest(false)}
 }
 useEffect(()=>{end.current?.scrollIntoView({block:"end",behavior:"smooth"});},[messages,busy]);
 const open=async(nextId:string)=>{if(busy||openingThread)return;setError("");setOpeningThread(true);
  try {
   const r=await fetch("/api/life/chat?id="+encodeURIComponent(nextId),{cache:"no-store"});
   const j=await r.json();
   if(j.ok&&Array.isArray(j.messages)){pendingRequest.current=null;setId(nextId);setMessages(j.messages);}
   else if(j.ok)setError("This chat could not be loaded. Please try again.");
   else setError(j.error||"Could not open this chat.");
  }catch{setError("Could not open this chat.");}
  finally{setOpeningThread(false);}
 };
 async function send(e:FormEvent){
  e.preventDefault();const message=input.trim();if(!message||busy)return;
  const previous=pendingRequest.current;
  const retry=previous?.message===message && previous?.conversationId===id;
  const requestKey=retry ? previous!.key : `life-${crypto.randomUUID()}`;
  const newConversationId=!id ? (retry ? previous!.newConversationId : `life-coach-${crypto.randomUUID()}`) : "";
  pendingRequest.current={key:requestKey,message,conversationId:id,newConversationId};
  setBusy(true);setError("");setMessages(a=>[...a,{role:"user",text:message}]);setInput("");
  try{
   const r=await fetch("/api/life/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,requestKey,...(id?{conversationId:id}:{newConversationId})})});
   const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Life Coach reply could not be saved.");
   pendingRequest.current=null;
   if(privatePreview && usageTest?.active)void loadUsage();
   setId(j.conversationId);setMessages(a=>[...a,{role:"assistant",text:j.response}]);await loadThreads();
  }catch(ex){
   if(privatePreview && usageTest?.active)void loadUsage();
   // A lost HTTP response can occur after Neon committed the conversation.
   // Read the known thread before offering a retry, never call Pickaxe again here.
   const lookupId=id||newConversationId;
   let restored=false;
   try {
    const history=await fetch("/api/life/chat?id="+encodeURIComponent(lookupId),{cache:"no-store"});
    if(history.ok){
     const data=await history.json();
     const saved=data.messages||[];
     if(data.ok && saved.length>=2 &&
        saved[saved.length-2]?.role==="user" &&
        saved[saved.length-2]?.text===message &&
        saved[saved.length-1]?.role==="assistant"){
       setId(lookupId);setMessages(saved);pendingRequest.current=null;
       await loadThreads();restored=true;
     }
    }
   }catch{/* Keep the original request ID; do not auto-resubmit. */}
   if(!restored){
    const msg=ex instanceof Error?ex.message:"Request failed.";
     setError(msg.startsWith("Life Coach becomes available at your next billing period.") ? msg : msg+" Check Previous chats before sending again.");
    setInput(message);setMessages(a=>a.slice(0,-1));
   }
  }finally{setBusy(false);}
 }
 return <section className={styles.layout}>
  <aside className={styles.history} aria-label="Previous Life Coach conversations">
   <h3>Previous chats</h3>
   <button className={styles.newButton} type="button" disabled={busy||openingThread} onClick={()=>{pendingRequest.current=null;setId("");setMessages([]);setError("");}}>New Chat</button>
   <div className={styles.threadList}>
    {historyState==="loading"&&<p role="status" style={{color:"var(--muted)"}}>Loading previous chats…</p>}
    {historyState==="error"&&<div role="alert">
     <p>Previous chats couldn't be loaded. They have not been deleted.</p>
     <button type="button" disabled={busy||openingThread} onClick={()=>{setHistoryState("loading");void loadThreads();}}>Retry loading chats</button>
    </div>}
    {historyState==="ready"&&threads.length===0&&<p style={{color:"var(--muted)"}}>No previous chats yet.</p>}
    {threads.map(t=><button key={t.id} className={styles.threadButton} type="button" disabled={busy||openingThread} aria-pressed={t.id===id} onClick={()=>void open(t.id)} style={{background:t.id===id?"#1b3440":"#0c1c2b"}}>{t.title}</button>)}
   </div>
  </aside>
  <div className={styles.chatPanel}>
   <h1 style={{margin:0}}>AI Coaching for Life</h1>
   <p style={{color:"var(--muted)",margin:0}}>{privatePreview ? "Private test • goals, habits and accountability" : "Goals, habits and accountability"}</p>
   {privatePreview&&usageTest&&!usageTest.active&&<button type="button" disabled={startingTest||busy} onClick={()=>void startUsageTest()}>Start optional 3-use test</button>}
   {privatePreview&&usageTest?.active&&<p role="status" style={{margin:0}}>Private AI uses left: {usageTest.remaining} of {usageTest.limit}. {usageTest.used} completed{usageTest.pending>0 ? `; ${usageTest.pending} pending verification` : ""}. Saved-memory recall remains free.</p>}
   {openingThread&&<p role="status" style={{color:"var(--muted)",margin:0}}>Opening saved conversation…</p>}
   <div role="log" aria-live="polite" aria-busy={busy||openingThread} className={styles.messageLog}>
    {!messages.length&&!input.trim()&&<p style={{color:"var(--muted)"}}>{intro}</p>}
    {messages.map((m,i)=><p key={i} className={styles.message} style={{background:m.role==="user"?"#17323b":"#101d2a"}}><strong>{m.role==="user"?"You":"Life Coach"}</strong><span style={{display:"block",marginTop:4}}>{m.role==="assistant"?<CoachResponse text={m.text}/>:m.text}</span></p>)}
    {busy&&<p>Coach is working…</p>}<div ref={end}/>
   </div>
   {error&&<p role="alert" style={{color:"#ffd39d"}}>{error}</p>}
   <form onSubmit={send} className={styles.compose}>
    <input aria-label="Message Life Coach" placeholder="Tell me what you'd like to work on…" value={input} onChange={e=>setInput(e.target.value)} maxLength={6000}/>
    <button disabled={busy||openingThread||!input.trim()} type="submit" className="primary-button">Send</button>
   </form>
  </div>
 </section>;
}
