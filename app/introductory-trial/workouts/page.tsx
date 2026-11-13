"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
type Plan={workouts?:Record<string,unknown>;weekSchedule?:Array<Record<string,unknown>>};
export default function TrialWorkouts(){
 const [plan,setPlan]=useState<Plan|null>(null);
 const [history,setHistory]=useState<unknown[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  fetch("/api/introductory-trial/workouts",{cache:"no-store"})
   .then(async r=>{const body=await r.json();if(!r.ok||!body.ok)throw Error(String(body.error||"Saved workouts unavailable"));return body;})
   .then(v=>{if(active){setPlan(v.plan||null);setHistory(Array.isArray(v.historyEntries)?v.historyEntries:[]);}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"Saved workouts unavailable");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[]);
 const workouts=plan?.workouts&&typeof plan.workouts==="object"?Object.entries(plan.workouts):[];
 const schedule=Array.isArray(plan?.weekSchedule)?plan.weekSchedule:[];
 return <main style={{maxWidth:800,margin:"2rem auto",padding:16}}>
  <h1>My Workouts — Introductory Coaching</h1>
  <p>Workouts saved here use your verified Fitness account and remain available after a paid conversion.</p>
  {loading&&<p>Loading your saved workouts…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&workouts.length===0&&<p>No verified saved workout plan yet. Ask Fitness Coach to create one.</p>}
  {workouts.map(([id,raw])=>{
   const item=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
   return <article key={id} style={{padding:16,border:"1px solid #999",borderRadius:10,marginBottom:12}}>
    <h2>{String(item.title||item.name||id)}</h2>
    {typeof item.durationMinutes==="number"&&<p>{item.durationMinutes} minutes</p>}
    {typeof item.description==="string"&&<p>{item.description}</p>}
   </article>;
  })}
  {schedule.length>0&&<section><h2>This Week</h2>
   {schedule.slice(0,14).map((item,i)=><p key={i}>{String(item.date||"")} — {String(item.workoutId||item.workout||item.title||"Scheduled workout")}</p>)}
  </section>}
  {history.length>0&&<p>{history.length} saved workout completion {history.length===1?"entry":"entries"}.</p>}
  <p><Link href="/introductory-trial/chat">Back to Fitness Coach</Link></p>
 </main>;
}
