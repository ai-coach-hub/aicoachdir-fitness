"use client";
import {SignUp,useUser} from "@clerk/nextjs";
import {useEffect} from "react";
import Link from "next/link";
export default function TrialCreateAccount(){
 const {isLoaded,isSignedIn}=useUser();
 useEffect(()=>{if(isLoaded&&isSignedIn)window.location.replace("/introductory-trial");},[isLoaded,isSignedIn]);
 return <main className="signup-shell" style={{paddingTop:40}}>
  <h1>Create your free coaching account</h1>
  <p>Verify your email to access your one-time 15-message introductory allowance. No payment is required.</p>
  {!isLoaded?<p>Checking your login…</p>:
   !isSignedIn?<SignUp routing="hash" forceRedirectUrl="/introductory-trial" signInUrl="/introductory-trial/chat"/>:
    <p>Opening coaching…</p>}
  <p><Link href="/introductory-trial">Review the Terms</Link></p>
 </main>;
}
