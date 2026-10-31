import {randomBytes} from 'node:crypto';
import {tierMember,obj,ident,iso,type Row} from './tierChangeRuntime';
import {stripeUsageWindowFromVerifiedRecord} from './stripeUsagePeriod';
import {verifyWalletForTierChange} from './productionTierWalletPreflight';
import {executeUpgrade,downgradeBody} from './tierTransactionOperations';

export async function tierChangeStatus(){
 const c=await tierMember();
 await c.sql`UPDATE public.ai_tier_change_intents SET state='failed',updated_at=now() WHERE member_key=${c.memberKey} AND state='prepared' AND period_end<=now()`;
 const intents=await c.sql`SELECT id,state,target_price_id,target_limit,period_end,invoice_id FROM public.ai_tier_change_intents WHERE member_key=${c.memberKey} AND stripe_subscription_id=${String(c.sub.id)} AND state IN ('prepared','awaiting_payment','scheduled') ORDER BY created_at DESC LIMIT 1`;
 return {ok:true,currentTier:c.current?.tier||'grandfathered',plans:c.catalog.map(({tier,cents})=>({tier,cents})),pending:intents[0]?{intentId:String(intents[0].id),state:String(intents[0].state),effectiveAt:iso(intents[0].period_end)}:null};
}
export async function prepareTierChange(target:unknown){
 const c=await tierMember(),{sql,sub,item,current}=c;
 const next=c.catalog.find(t=>t.tier===target);
 if(!current)throw Error('Your grandfathered plan is preserved. Contact support to discuss a voluntary change.');
 if(!next||next.tier===current.tier)throw Error('Choose a different plan.');
 if(sub.cancel_at_period_end||sub.pending_update||sub.schedule)throw Error('A billing change is already pending.');
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId:String(c.m.stripe_customer_id),subscriptionId:String(sub.id),priceId:current.price});
 if(!window.ok)throw Error('Billing period is unverified.');
 const wallets=await sql`SELECT * FROM public.shared_ai_usage_periods WHERE member_key=${c.memberKey} AND period_start=${window.periodStart}::timestamptz LIMIT 2`;
 const checked=verifyWalletForTierChange({verifiedMember:true,uniqueLinkedSubscription:true,activeSubscription:true,grandfatheredPlan:false,approvedCurrentPrice:true,stripePeriodStart:window.periodStart,stripePeriodEnd:window.periodEnd,nowMillis:Date.now(),walletRows:wallets.map(w=>({periodStart:iso(w.period_start),periodEnd:iso(w.period_end),limit:Number(w.limit_uses),completed:Number(w.completed_uses),reserved:Number(w.reserved_uses)}))});
 if(!checked.ok||checked.allowance!==current.messages)throw Error('Message balance must be reconciled before changing plans.');
 const pending=await sql`SELECT * FROM public.ai_tier_change_intents WHERE stripe_subscription_id=${String(sub.id)} AND state IN ('prepared','awaiting_payment','scheduled') LIMIT 2`;
 if(pending.length){
  const i=pending[0];
  if(pending.length===1&&i.state==='prepared'&&i.member_key===c.memberKey&&i.target_price_id===next.price)return {ok:true,intentId:String(i.id),currentTier:current.tier,targetTier:next.tier,status:'prepared'};
  throw Error('A plan change is already pending.');
 }
 const id='upg_'+randomBytes(18).toString('hex');
 const inserted=await sql`INSERT INTO public.ai_tier_change_intents(id,member_key,entitlement_key,period_start,period_end,stripe_customer_id,stripe_subscription_id,stripe_item_id,old_price_id,target_price_id,expected_limit,target_limit,state,direction)
 VALUES(${id},${c.memberKey},${String(wallets[0].entitlement_key)},${window.periodStart}::timestamptz,${window.periodEnd}::timestamptz,${String(c.m.stripe_customer_id)},${String(sub.id)},${String(item.id)},${current.price},${next.price},${current.messages},${next.messages},'prepared',${next.cents>current.cents?'upgrade':'downgrade'}) ON CONFLICT DO NOTHING RETURNING id`;
 if(inserted.length!==1)throw Error('A plan change is already pending.');
 return {ok:true,intentId:id,currentTier:current.tier,targetTier:next.tier,status:'prepared'};
}
async function ownedIntent(id:unknown){
 if(typeof id!=='string'||!/^upg_[a-f0-9]{36}$/.test(id))throw Error('Invalid request.');
 const c=await tierMember();
 const rows=await c.sql`SELECT * FROM public.ai_tier_change_intents WHERE id=${id} AND member_key=${c.memberKey} LIMIT 1`;
 const i=rows[0];
 if(!i||i.stripe_customer_id!==c.m.stripe_customer_id||i.stripe_subscription_id!==c.sub.id||i.stripe_item_id!==c.item.id)throw Error('Plan change is not linked to your account.');
 const old=c.catalog.find(t=>t.price===i.old_price_id),next=c.catalog.find(t=>t.price===i.target_price_id);
 if(!old||!next||old.messages!==i.expected_limit||next.messages!==i.target_limit)throw Error('Plan mapping changed.');
 return {...c,i,old,next};
}
function unchanged(c:Awaited<ReturnType<typeof ownedIntent>>){
 const {sub,item,i}=c;
 if(sub.cancel_at_period_end||sub.pending_update||sub.schedule||obj(item.price).id!==i.old_price_id)throw Error('Subscription changed. Refresh and review it.');
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId:String(i.stripe_customer_id),subscriptionId:String(i.stripe_subscription_id),priceId:String(i.old_price_id)});
 if(!window.ok||window.periodStart!==iso(i.period_start)||window.periodEnd!==iso(i.period_end))throw Error('Billing period changed.');
 return window;
}
export async function quoteTierChange(id:unknown){
 const c=await ownedIntent(id),{sql,i}=c;
 if(i.state!=='prepared')throw Error('This change is already processing.');
 unchanged(c);
 const date=Math.floor(Date.now()/1000);
 let amount=0;
 if(i.direction==='upgrade'){
  const quote=await c.stripe('/invoices/create_preview',{method:'POST',body:new URLSearchParams({customer:String(i.stripe_customer_id),subscription:String(i.stripe_subscription_id),'subscription_details[items][0][id]':String(i.stripe_item_id),'subscription_details[items][0][price]':String(i.target_price_id),'subscription_details[proration_date]':String(date),'subscription_details[proration_behavior]':'always_invoice'})});
  amount=Number(quote.amount_due);
  if(ident(quote.customer)!==i.stripe_customer_id||quote.currency!=='usd'||!Number.isSafeInteger(amount)||amount<0||amount>c.next.cents)throw Error('Unexpected invoice preview.');
 }
 const rows=await sql`UPDATE public.ai_tier_change_intents SET proration_date=${date},quoted_amount=${amount},quoted_at=now(),updated_at=now() WHERE id=${String(i.id)} AND state='prepared' RETURNING id`;
 if(rows.length!==1)throw Error('Change already processing.');
 return {ok:true,intentId:String(i.id),direction:String(i.direction),amountCents:amount,monthlyCents:c.next.cents,currency:'usd',effectiveAt:i.direction==='downgrade'?iso(i.period_end):null};
}
export async function confirmTierChange(id:unknown,expectedAmount:unknown){
 const c=await ownedIntent(id),{sql,i,sub}=c;
 if(i.state==='applied'||i.state==='scheduled')return {ok:true,status:String(i.state)};
 if(!['prepared','awaiting_payment'].includes(String(i.state)))throw Error('This request has ended.');
 if(i.state==='prepared'){
  unchanged(c);
  if(i.quoted_at===null||Date.now()-new Date(String(i.quoted_at)).getTime()>300000||expectedAmount!==Number(i.quoted_amount))throw Error('Please refresh the quote and confirm again.');
  const wallets=await sql`SELECT limit_uses,period_end FROM public.shared_ai_usage_periods WHERE member_key=${c.memberKey} AND entitlement_key=${String(i.entitlement_key)} AND period_start=${iso(i.period_start)}::timestamptz`;
  if(wallets.length!==1||wallets[0].limit_uses!==i.expected_limit||iso(wallets[0].period_end)!==iso(i.period_end))throw Error('Message balance changed.');
 }
 if(i.direction==='upgrade'){
  const invoiceId=await executeUpgrade(i,{
   stripe:c.stripe,
   claim:async()=>{if(i.state==='prepared'){const claimed=await sql`UPDATE public.ai_tier_change_intents SET state='awaiting_payment',updated_at=now() WHERE id=${String(i.id)} AND state='prepared' AND proration_date=${Number(i.proration_date)} AND quoted_amount=${Number(i.quoted_amount)} RETURNING id`;if(claimed.length!==1)throw Error('Quote changed or confirmation already processing.');}},
   bind:async invoice=>{const rows=await sql`UPDATE public.ai_tier_change_intents SET invoice_id=${invoice},updated_at=now() WHERE id=${String(i.id)} AND state='awaiting_payment' AND (invoice_id IS NULL OR invoice_id=${invoice}) RETURNING id`;if(rows.length!==1)throw Error('Invoice binding pending.');}
  });
  const invoice=await c.stripe('/invoices/'+invoiceId);
  if(ident(invoice.customer)!==i.stripe_customer_id||ident(invoice.subscription||obj(obj(invoice.parent).subscription_details).subscription)!==i.stripe_subscription_id||invoice.billing_reason!=='subscription_update')throw Error('Invoice mismatch.');
  let paymentUrl:string|null=null;
  if(typeof invoice.hosted_invoice_url==='string'&&new URL(invoice.hosted_invoice_url).hostname==='invoice.stripe.com')paymentUrl=invoice.hosted_invoice_url;
  // Only the signed paid webhook grants messages; returning success here is not a grant.
  return {ok:true,status:invoice.status==='paid'?'payment_received':invoice.status==='void'?'expired':'awaiting_payment',paymentUrl};
 }
 if(Date.now()-new Date(String(i.created_at)).getTime()>23*3600000)throw Error('Old schedule request requires review.');
 // Existing plans with tax/discount/custom invoice settings need explicit handling,
 // otherwise a phase update could silently drop their terms.
 if(obj(sub.automatic_tax).enabled||Array.isArray(sub.discounts)&&sub.discounts.length||Array.isArray(sub.default_tax_rates)&&sub.default_tax_rates.length||sub.collection_method!=='charge_automatically'||sub.billing_thresholds||obj(c.item).tax_rates&&Array.isArray(c.item.tax_rates)&&c.item.tax_rates.length)throw Error('Custom billing terms require support.');
 if(i.state==='prepared'){const claimed=await sql`UPDATE public.ai_tier_change_intents SET state='awaiting_payment',updated_at=now() WHERE id=${String(i.id)} AND state='prepared' AND proration_date=${Number(i.proration_date)} AND quoted_amount=${Number(i.quoted_amount)} RETURNING id`;if(claimed.length!==1)throw Error('Quote changed or confirmation already processing.');}
 let scheduleId=String(i.schedule_id||'');
 if(!scheduleId){
  const created=await c.stripe('/subscription_schedules',{method:'POST',body:new URLSearchParams({from_subscription:String(i.stripe_subscription_id)}),idempotencyKey:'tier_schedule_create_'+i.id});
  scheduleId=String(created.id||'');
  if(!/^sub_sched_[A-Za-z0-9]+$/.test(scheduleId)||ident(created.subscription)!==i.stripe_subscription_id)throw Error('Schedule binding unavailable.');
  await sql`UPDATE public.ai_tier_change_intents SET schedule_id=${scheduleId} WHERE id=${String(i.id)} AND state='awaiting_payment' AND (schedule_id IS NULL OR schedule_id=${scheduleId})`;
 }
 const schedule=await c.stripe('/subscription_schedules/'+scheduleId);
 if(ident(schedule.subscription)!==i.stripe_subscription_id||schedule.status!=='active')throw Error('Schedule changed.');
 const phase=obj(schedule.current_phase),start=Number(phase.start_date),end=new Date(iso(i.period_end)).getTime()/1000;
 if(!Number.isSafeInteger(start)||start>=end||Number(phase.end_date)!==end)throw Error('Schedule boundary mismatch.');
 const body=downgradeBody({start,end,currentPrice:String(i.old_price_id),targetPrice:String(i.target_price_id)});
 body.set('metadata[tier_change_intent]',String(i.id));
 const updated=await c.stripe('/subscription_schedules/'+scheduleId,{method:'POST',body,idempotencyKey:'tier_schedule_update_'+i.id});
 const phases=Array.isArray(updated.phases)?updated.phases:[];
 if(phases.length!==2||obj(phases[0]).end_date!==end||obj(phases[1]).start_date!==end)throw Error('Schedule not confirmed.');
 await sql`UPDATE public.ai_tier_change_intents SET state='scheduled',updated_at=now() WHERE id=${String(i.id)} AND state='awaiting_payment'`;
 return {ok:true,status:'scheduled',effectiveAt:iso(i.period_end)};
}

export async function cancelPreparedTierChange(id:unknown){
 const {sql,i}=await ownedIntent(id);
 const rows=await sql`UPDATE public.ai_tier_change_intents SET state='failed',updated_at=now() WHERE id=${String(i.id)} AND state='prepared' RETURNING id`;
 if(rows.length!==1)throw Error('Processing changes cannot be discarded.');
 return {ok:true,status:'discarded'};
}
