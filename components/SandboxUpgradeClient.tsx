"use client";
import {useEffect,useState} from "react";

type Plan={tier:string;monthlyUsdCents:number;includedMessages:number};
type Snapshot={ok:boolean;ready?:boolean;enabled?:boolean;currentTier?:string;
 options?:Plan[];reason?:string};
type Quote={ok:boolean;intentId?:string;amountCents?:number;status?:string;reason?:string;error?:string};

const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD"
}).format(cents/100);
const label=(text:string)=>text.slice(0,1).toUpperCase()+text.slice(1);
const failure=(reason:string)=>{
 if(reason==="membership_not_verified")return "Your verified test membership was not found. No payment was attempted.";
 if(reason==="subscription_not_ready")return "Your test subscription needs review before making a change.";
 if(reason==="wallet_needs_operator_review"||reason==="paid_test_wallet_not_unique")
  return "The saved test allowance needs review. No messages or payments were changed.";
 if(reason==="test_configuration_missing"||reason==="incorrect_test_stripe_account")
  return "The isolated test environment is not completely configured.";
 return "This test upgrade is not yet available ("+reason+"). No payment was attempted.";
};
async function post(path:string,body:unknown):Promise<Quote>{
 const res=await fetch(path,{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
  cache:"no-store"});
 const result=await res.json();
 return result as Quote;
}
export default function SandboxUpgradeClient(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [selected,setSelected]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [intent,setIntent]=useState("");
 const [amount,setAmount]=useState<number|null>(null);
 const [finished,setFinished]=useState("");
 const reload=async()=>{
  const res=await fetch("/api/billing/sandbox-upgrade/current",{cache:"no-store"});
  const result=await res.json() as Snapshot;
  setSnapshot(result);
  if(result.options?.length)setSelected(result.options[0].tier);
 };
 useEffect(()=>{void reload().catch(()=>setSnapshot({ok:false,reason:"status_unavailable"}));},[]);
 const setup=async()=>{
  setBusy(true);setMessage("");
  try{
   const result=await post("/api/billing/sandbox-upgrade/current",{});
   if(!result.ok)throw Error(result.reason||result.error||"setup_unavailable");
   await reload();
  }catch(e){setMessage(failure(e instanceof Error?e.message:"setup_unavailable"))}
  finally{setBusy(false);}
 };
 const preview=async()=>{
  if(!selected||busy||intent)return;
  setBusy(true);setMessage("");
  try{
   const prepared=await post("/api/billing/sandbox-upgrade",{targetTier:selected});
   if(!prepared.ok||!prepared.intentId)throw Error(prepared.reason||prepared.error||"could_not_prepare");
   setIntent(prepared.intentId);
   const quoted=await post("/api/billing/sandbox-upgrade/transaction",{
    action:"quote",intentId:prepared.intentId
   });
   if(!quoted.ok||!Number.isSafeInteger(quoted.amountCents)||Number(quoted.amountCents)<=0)
    throw Error(quoted.reason||quoted.error||"quote_unavailable");
   setAmount(Number(quoted.amountCents));
  }catch(e){setMessage(failure(e instanceof Error?e.message:"quote_unavailable"))}
  finally{setBusy(false);}
 };
 const confirm=async()=>{
  if(!intent||amount===null||busy)return;
  setBusy(true);setMessage("");
  try{
   const result=await post("/api/billing/sandbox-upgrade/transaction",{
    action:"confirm",intentId:intent,expectedAmountCents:amount
   });
   if(!result.ok)throw Error(result.reason||result.error||"operator_review_required");
   setFinished(result.status||"pending");
   if(result.status==="applied"){
    setMessage("The test-only upgrade was applied. Your subscription was not charged in live mode.");
   }else{
    setMessage("Stripe is still confirming the test payment. Do not submit a second upgrade.");
   }
  }catch{
   setMessage("The upgrade outcome needs review. Do not click Confirm again or create a new upgrade.");
   setFinished("needs_review");
  }finally{setBusy(false);}
 };
 return <section aria-label="Test subscription upgrades" style={{
  border:"1px solid #AA78D3",borderRadius:16,padding:20,marginTop:24}}>
  <h2 style={{marginTop:0}}>Preview subscription changes</h2>
  <p style={{marginTop:0}}>Test environment only. No charge to a real payment method.</p>
  {!snapshot&&<p role="status">Checking your test membership…</p>}
  {snapshot&&!snapshot.ok&&<p role="alert">{failure(snapshot.reason||"not_available")}</p>}
  {snapshot?.ok&&<>
   <p><strong>Current plan:</strong> {label(snapshot.currentTier||"unknown")}</p>
   {!snapshot.ready&&<div>
    <p>This test membership needs its existing paid test allowance connected. Previous completed and reserved messages will be preserved.</p>
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>void setup()}>
      {busy?"Connecting…":"Connect existing test allowance"}
    </button>
   </div>}
   {snapshot.ready&&!snapshot.enabled&&<p role="status">The test-only upgrade switch is still off. No billing change can be submitted.</p>}
   {snapshot.ready&&snapshot.enabled&&!(snapshot.options||[]).length&&
    <p>You're on the highest test plan. There is no higher plan to upgrade to.</p>}
   {snapshot.ready&&snapshot.enabled&&(snapshot.options||[]).length>0&&!intent&&<div>
    <label htmlFor="qa-tier">Upgrade to</label>
    <select id="qa-tier" value={selected} disabled={busy}
      onChange={e=>setSelected(e.target.value)}
      style={{display:"block",padding:10,margin:"8px 0 16px",width:"100%",maxWidth:350}}>
      {snapshot.options?.map(x=><option key={x.tier} value={x.tier}>
       {label(x.tier)} — {money(x.monthlyUsdCents)}/month, {x.includedMessages} messages
      </option>)}
    </select>
    <p>The amount due for the rest of this billing period will be calculated from Stripe before confirmation.</p>
    <button className="primary-button" disabled={busy||!selected} type="button" onClick={()=>void preview()}>
     {busy?"Checking test pricing…":"Review test upgrade"}
    </button>
   </div>}
   {snapshot.ready&&snapshot.enabled&&intent&&amount===null&&!finished&&
    <p role="status">A test upgrade has been prepared. No payment was made. If the quote failed, this attempt needs review before another one.</p>}
   {amount!==null&&!finished&&<div>
    <p><strong>Exact Stripe test-mode amount due now: {money(amount)}</strong></p>
    <p>After successful test payment, your higher monthly plan and message allowance take effect without resetting used messages.</p>
    <button className="primary-button" disabled={busy} type="button" onClick={()=>void confirm()}>
     {busy?"Submitting one test upgrade…":"Confirm test-only upgrade"}
    </button>
   </div>}
  </>}
  {message&&<p role={finished==="applied"?"status":"alert"}>{message}</p>}
  {finished==="applied"&&<p>Refresh this page to review the updated test plan.</p>}
 </section>;
}
