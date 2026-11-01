type Row=Record<string,unknown>;
type Stripe=(path:string,init?:{method?:'GET'|'POST';body?:URLSearchParams;idempotencyKey?:string})=>Promise<Row>;
// The persisted quote fixes every parameter across retries, including time.
export async function executeUpgrade(i:Row,deps:{stripe:Stripe;claim:()=>Promise<void>;bind:(id:string)=>Promise<void>}){
 if(i.invoice_id)return String(i.invoice_id);
 if(Date.now()-new Date(String(i.created_at)).getTime()>23*60*60*1000)
  throw Error('Ambiguous old request requires review');
 await deps.claim();
 const body=new URLSearchParams({
  'items[0][id]':String(i.stripe_item_id),'items[0][price]':String(i.target_price_id),
  proration_behavior:'always_invoice',payment_behavior:'pending_if_incomplete',
  proration_date:String(i.proration_date)
 });
 const sub=await deps.stripe('/subscriptions/'+i.stripe_subscription_id,
  {method:'POST',body,idempotencyKey:'tier_upgrade_'+i.id});
 const invoice=typeof sub.latest_invoice==='string'?sub.latest_invoice:
  String((sub.latest_invoice as Row|undefined)?.id||'');
 if(!/^in_[A-Za-z0-9]+$/.test(invoice))throw Error('Invoice binding requires review');
 await deps.bind(invoice);
 return invoice;
}
export function downgradeBody(a:{start:number;end:number;currentPrice:string;targetPrice:string}){
 return new URLSearchParams({
  end_behavior:'release',proration_behavior:'none',
  'phases[0][start_date]':String(a.start),'phases[0][end_date]':String(a.end),
  'phases[0][items][0][price]':a.currentPrice,'phases[0][items][0][quantity]':'1',
  'phases[0][proration_behavior]':'none','phases[1][start_date]':String(a.end),
  'phases[1][items][0][price]':a.targetPrice,'phases[1][items][0][quantity]':'1',
  'phases[1][proration_behavior]':'none','phases[1][duration][interval]':'month',
  'phases[1][duration][interval_count]':'1'
 });
}
