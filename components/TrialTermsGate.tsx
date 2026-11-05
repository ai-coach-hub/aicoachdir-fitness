"use client";
import {useUser} from "@clerk/nextjs";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {TERMS_ACCEPTANCE_TEXT} from "@/lib/termsAcceptance";
export default function TrialTermsGate({children}:{children:ReactNode}){
 const {isSignedIn,user}=useUser();
 const scroll=useRef<HTMLDivElement|null>(null);
 const [end,setEnd]=useState(false),[agreed,setAgreed]=useState(false);
 const [email,setEmail]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  const verified=user?.emailAddresses?.find(e=>e.id===user.primaryEmailAddressId);
  if(verified?.verification?.status==="verified")setEmail(verified.emailAddress.trim().toLowerCase());
 },[user]);
 const valid=isSignedIn&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
 async function agree(){
  if(!end||!agreed||!valid||saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/terms-acceptance",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:email.trim().toLowerCase(),
     clientAcceptedAt:new Date().toISOString(),introductoryTrial:true}),
    cache:"no-store"
   });
   const data=await response.json();
   if(!response.ok||!data?.ok)throw Error(String(data?.message||"Unable to record Terms acceptance"));
   window.location.assign("/introductory-trial/chat");
  }catch(e){setError(e instanceof Error?e.message:"Unable to record Terms acceptance");setSaving(false);}
 }
 return <section className="terms-card">
  <div className="terms-heading">
   <p className="eyebrow">INTRODUCTORY COACHING</p>
   <h1>Try 15 messages free</h1>
   <p>One free allowance shared across Fitness, Budgeting, and Life. No credit card, automatic charge, or automatic conversion to a paid plan.</p>
   <p>Review the Terms below, then create or reuse your verified account.</p>
  </div>
  <div className="plan-summary">
   <div><span>Offer</span><strong>AI Coach Directory Introductory Trial</strong></div>
   <div><span>Price</span><strong>$0</strong></div>
   <div><span>AI Coach Messages</span><strong>15 total across three coaches</strong></div>
   <div><span>Renewal</span><strong>No automatic billing; membership optional afterward</strong></div>
  </div>
  <div className="terms-scroll" ref={scroll} tabIndex={0}
   aria-label="Terms and Conditions. Scroll to the end to enable agreement."
   onScroll={()=>{const e=scroll.current;if(e&&e.scrollTop+e.clientHeight>=e.scrollHeight-10)setEnd(true);}}>
   {children}
   <div className="terms-end"><strong>End of Terms & Conditions</strong></div>
  </div>
  <div className="agreement-area">
   <div className="acceptance-email-field">
    <label htmlFor="trial-email">Email address</label>
    <input id="trial-email" type="email" autoComplete="email" maxLength={254}
     required readOnly value={email}
     placeholder="you@example.com"/>
    <span>This is your verified account email. The agreement is recorded only for this account. Existing members keep their paid or grandfathered access.</span>
   </div>
   <label className={end?"check-row":"check-row disabled"}>
    <input type="checkbox" checked={agreed} disabled={!end||saving}
     onChange={e=>setAgreed(e.target.checked)}/>
    <span>{TERMS_ACCEPTANCE_TEXT}</span>
   </label>
   {!end&&<p className="status-note">Scroll through the complete Terms to unlock agreement.</p>}
   {error&&<p role="alert" className="acceptance-save-error">{error}</p>}
   <button className="primary-button full-button" type="button" disabled={!end||!agreed||!valid||saving}
    onClick={agree}>{saving?"Saving agreement…":"Continue to Free Coaching"}</button>
   <p className="microcopy center">No payment is collected. Paid membership is a separate, optional purchase.</p>
  </div>
 </section>;
}
