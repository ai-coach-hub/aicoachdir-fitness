'use client';
import {useEffect,useState} from 'react';
type Plan={tier:string;cents:number};
type Quote={intentId:string;direction:string;amountCents:number;monthlyCents:number;effectiveAt:string|null};
const money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const title=(s:string)=>s[0].toUpperCase()+s.slice(1);
const messages:Record<string,number>={starter:100,growth:200,premium:400,elite:600};
export default function TierChangeClient(){
 const [plans,setPlans]=useState<Plan[]>([]),[current,setCurrent]=useState(''),[target,setTarget]=useState('');
 const [quote,setQuote]=useState<Quote|null>(null),[message,setMessage]=useState('Loading your plan…'),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<{intentId:string;state:string}|null>(null),[paymentUrl,setPaymentUrl]=useState<string|null>(null);
 async function refresh(){
  const r=await fetch('/api/billing/tier-change/current',{cache:'no-store'}),data=await r.json();
  if(!data.ok){setMessage(data.reason);return;}
  setPlans(data.plans);setCurrent(data.currentTier);setPending(data.pending);
  setMessage(data.currentTier==='grandfathered'?'Your grandfathered membership keeps its existing price and benefits.':data.pending?.state==='scheduled'?'Your plan change is scheduled for your next renewal.':data.pending?.state==='awaiting_payment'?'Your payment is being confirmed. Check status below.':'');
 }
 useEffect(()=>{refresh().catch(()=>setMessage('We could not load your plan. Please refresh.'));},[]);
 async function post(path:string,body:unknown){
  const r=await fetch('/api/billing/tier-change/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();if(!data.ok)throw Error(data.reason||'This change is unavailable.');return data;
 }
 async function review(){setBusy(true);setMessage('');try{
  const prepared=pending?.state==='prepared'?pending:await post('prepare',{targetTier:target});
  setQuote(await post('transaction',{action:'quote',intentId:prepared.intentId}));
 }catch(e){setMessage(e instanceof Error?e.message:'Unable to review plan.');}finally{setBusy(false);}}
 async function confirm(){setBusy(true);setMessage('');try{
  const result=await post('transaction',{action:'confirm',intentId:quote?.intentId||pending?.intentId,expectedAmountCents:quote?.amountCents});
  setPaymentUrl(result.paymentUrl||null);setQuote(null);await refresh();
  setMessage(result.status==='scheduled'?'Your new plan starts at your next renewal. Your current benefits continue until then.':result.status==='applied'?'Your plan and message allowance are updated.':result.status==='payment_received'?'Payment received. Your message allowance will update after payment confirmation.':'Payment needs confirmation. Your existing message balance is preserved.');
 }catch(e){setMessage(e instanceof Error?e.message:'Unable to confirm change.');}finally{setBusy(false);}}
 async function discard(){setBusy(true);try{await post('transaction',{action:'discard',intentId:quote?.intentId||pending?.intentId});setQuote(null);await refresh();}catch{setMessage('The change is already processing. Refresh its status.');}finally{setBusy(false);}}
 return <section aria-labelledby="change-plan-title" className="tier-change-panel">
  <p className="tier-change-eyebrow">MEMBERSHIP OPTIONS</p>
  <h2 id="change-plan-title">Choose your plan</h2>
  {current&&<div className="tier-change-current"><span>Your current plan</span><strong>{title(current)}</strong></div>}
  {message&&<p role="status">{message}</p>}
  {current&&current!=='grandfathered'&&!pending&&!quote&&<>
   <p className="tier-change-intro">Select a membership to review your options.</p>
   <div className="tier-change-plan-list" role="group" aria-label="Choose a new monthly membership">
    {plans.filter(p=>p.tier!==current).map(p=>{
     const selected=target===p.tier;
     return <button type="button" key={p.tier} className={`tier-change-plan${selected?' is-selected':''}`}
      aria-pressed={selected} onClick={()=>setTarget(p.tier)} disabled={busy}>
      <span className="tier-change-plan-header">
       <span className="tier-change-plan-name"><span className="tier-change-select-circle" aria-hidden="true"/><strong>{title(p.tier)}</strong></span>
       <span className="tier-change-plan-price">{money(p.cents)}<small>/month</small></span>
      </span>
      <span className="tier-change-plan-messages">{messages[p.tier]??0} AI Coach messages per month</span>
     </button>;
    })}
   </div>
   <div className="tier-change-actions">
    <button type="button" className="primary-button" disabled={!target||busy} onClick={review}>{busy?'Reviewing…':target?'Review '+title(target):'Select a plan'}</button>
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>refresh().catch(()=>setMessage('Please try again.'))}>Refresh status</button>
   </div>
   <p className="tier-change-note">Reviewing a plan will not change your subscription or charge your card.</p>
  </>}
  {pending?.state==='prepared'&&!quote&&<button disabled={busy} onClick={review}>Review pending change</button>}
  {quote&&<div><p>{quote.direction==='upgrade'?`${money(quote.amountCents)} due now for the remainder of this billing period.`:`Nothing due now. Your new plan begins ${new Date(quote.effectiveAt!).toLocaleDateString()}.`}</p>
   <p>Then {money(quote.monthlyCents)} per month. Your saved coaching data stays with your account.</p>
   <button className="primary-button" disabled={busy} onClick={confirm}>{busy?'Processing…':'Confirm plan change'}</button>
  </div>}
  {(quote||pending?.state==='prepared')&&<button disabled={busy} onClick={discard}>Keep current plan</button>}
  {pending?.state==='awaiting_payment'&&<button disabled={busy} onClick={confirm}>Check payment status</button>}
  {paymentUrl&&<p><a href={paymentUrl}>Complete payment securely with Stripe</a></p>}
  {(pending||quote)&&<p><button className="secondary-button" disabled={busy} onClick={()=>refresh().catch(()=>setMessage('Please try again.'))}>Refresh status</button></p>}
 </section>;
}
