import {tierRuntime,obj,ident,iso} from './tierChangeRuntime';
import {stripeUsageWindowFromVerifiedRecord} from './stripeUsagePeriod';
export async function reconcileTierRenewal(invoiceId:string){
 const {sql,stripe,live,catalog}=await tierRuntime(true);
 const invoice=await stripe('/invoices/'+invoiceId);
 if(invoice.livemode!==live||invoice.status!=='paid'||invoice.paid!==true||invoice.billing_reason!=='subscription_cycle')return 'ignored';
 const subId=ident(invoice.subscription||obj(obj(invoice.parent).subscription_details).subscription);
 if(!/^sub_[A-Za-z0-9]+$/.test(subId))return 'ignored';
 const intents=await sql`SELECT * FROM public.ai_tier_change_intents WHERE stripe_subscription_id=${subId} AND (state IN ('scheduled','applied') OR (state='awaiting_payment' AND direction='downgrade')) ORDER BY created_at DESC LIMIT 1`;
 if(!intents.length)return 'ignored';
 const i=intents[0],sub=await stripe('/subscriptions/'+subId);
 if(i.state==='awaiting_payment'){
  const scheduleId=String(i.schedule_id||ident(sub.schedule));
  if(!scheduleId)throw Error('Schedule binding requires recovery');
  const schedule=await stripe('/subscription_schedules/'+scheduleId);
  if(obj(schedule.metadata).tier_change_intent!==i.id)throw Error('Schedule intent mismatch');
  const phases=Array.isArray(schedule.phases)?schedule.phases:[];
  const next=phases.find(p=>Number(p.start_date)===new Date(iso(i.period_end)).getTime()/1000);
  const items=Array.isArray(next?.items)?next.items:[];
  if(ident(schedule.subscription||schedule.released_subscription)!==subId||items.length!==1||ident(items[0].price)!==i.target_price_id)throw Error('Schedule is not verified');
  await sql`UPDATE public.ai_tier_change_intents SET state='scheduled',schedule_id=${scheduleId},updated_at=now() WHERE id=${String(i.id)} AND state='awaiting_payment'`;
 }

 if(sub.livemode!==live||sub.status!=='active'||ident(sub.customer)!==i.stripe_customer_id||ident(invoice.customer)!==i.stripe_customer_id)throw Error('Renewal binding mismatch');
 const tier=catalog.find(t=>t.price===i.target_price_id);
 if(!tier||tier.messages!==i.target_limit)throw Error('Renewal catalog mismatch');
 const window=stripeUsageWindowFromVerifiedRecord(sub,{customerId:String(i.stripe_customer_id),subscriptionId:subId,priceId:tier.price});
 if(!window.ok)throw Error('Renewal window mismatch');
 // Only the paid recurring line for the current subscription period can mint a wallet.
 const lines=await stripe('/invoices/'+invoiceId+'/lines?limit=100');
 const matches=(Array.isArray(lines.data)?lines.data:[]).filter(l=>{
  const parent=obj(obj(l.parent).subscription_item_details),price=ident(l.price||obj(obj(l.pricing).price_details).price);
  return price===tier.price&&parent.proration!==true&&l.proration!==true&&
   (ident(parent.subscription||l.subscription)||subId)===subId&&
   new Date(Number(obj(l.period).start)*1000).toISOString()===window.periodStart&&
   new Date(Number(obj(l.period).end)*1000).toISOString()===window.periodEnd;
 });
 if(lines.has_more||matches.length!==1)throw Error('Paid renewal line mismatch');
 if(new Date(window.periodStart)<new Date(iso(i.period_end)))return 'ignored';
 const applied=await sql`SELECT public.ai_tier_apply_paid_renewal(${String(i.id)},${invoiceId},${window.periodStart}::timestamptz,${window.periodEnd}::timestamptz,${tier.messages}) AS status`;
 if(applied[0]?.status!=='applied')throw Error('Renewal wallet conflict');
 return 'applied';
}
export async function reconcileExpiredTierPayment(invoiceId:string){
 const {sql,stripe,live}=await tierRuntime(true);
 const invoice=await stripe('/invoices/'+invoiceId);
 if(invoice.livemode!==live||invoice.status!=='void')return 'ignored';
 const subId=ident(invoice.subscription||obj(obj(invoice.parent).subscription_details).subscription);
 const sub=await stripe('/subscriptions/'+subId);
 if(sub.livemode!==live||sub.pending_update)return 'ignored';
 await sql`UPDATE public.ai_tier_change_intents SET state='failed',updated_at=now() WHERE invoice_id=${invoiceId} AND stripe_subscription_id=${subId} AND stripe_customer_id=${ident(invoice.customer)} AND state='awaiting_payment' AND direction='upgrade'`;
 return 'expired';
}
