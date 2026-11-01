import {neon} from '@neondatabase/serverless';
import {currentUser} from '@clerk/nextjs/server';
import {membershipDb} from './fitnessMembershipDb';
import {stripeRequest,stripeMode} from './stripeServer';
import {sharedUsageMemberKey} from './sharedUsageMemberIdentity';
export type Row=Record<string,unknown>;
export const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
export const ident=(v:unknown)=>typeof v==='string'?v:String(obj(v).id||'');
export const iso=(v:unknown)=>new Date(String(v)).toISOString();
export const tiers=[{tier:'starter',cents:900,messages:100},{tier:'growth',cents:1500,messages:200},
 {tier:'premium',cents:2500,messages:400},{tier:'elite',cents:3500,messages:600}] as const;
export function tierChangesEnabled(){
 return process.env.VERCEL_ENV==='preview'
  ? process.env.VERCEL_GIT_COMMIT_REF==='feature/production-tier-release-guards-20261029'&&process.env.UPGRADE_SANDBOX_MEMBER_UPGRADES_ENABLED==='true'
  : process.env.VERCEL_ENV==='production'&&process.env.PUBLIC_TIER_UPGRADES_ENABLED==='true'&&process.env.PRODUCTION_TIER_TRANSACTIONS_ENABLED==='true';
}

export async function bindVerifiedTierMemberIdentity(args:{
 membership:Row;userId:string;email:string;customer:Row;subscription:Row;
 persist:()=>Promise<Row[]>;
}){
 const {membership,userId,customer,subscription}=args;
 if(String(membership.clerk_user_id||'')===userId)return membership;
 const email=args.email.trim().toLowerCase();
 const customerId=String(membership.stripe_customer_id||'');
 const subscriptionId=String(membership.stripe_subscription_id||'');
 if(!userId||customer.deleted||String(customer.email||'').trim().toLowerCase()!==email||
  ident(customer)!==customerId||ident(subscription)!==subscriptionId||
  ident(subscription.customer)!==customerId||subscription.status!=='active')
  throw Error('Membership is not verified.');
 const rows=await args.persist();
 if(rows.length!==1||String(rows[0].clerk_user_id||'')!==userId)
  throw Error('Membership is not verified.');
 return rows[0];
}
export async function tierRuntime(webhook=false){
 const preview=process.env.VERCEL_ENV==='preview';
 // Webhooks must continue settling payments even when new requests are paused.
 const enabled=webhook?(preview?process.env.UPGRADE_SANDBOX_WEBHOOK_ENABLED==='true'&&process.env.VERCEL_GIT_COMMIT_REF==='feature/production-tier-release-guards-20261029':process.env.VERCEL_ENV==='production'&&process.env.PRODUCTION_UPGRADE_WEBHOOK_ENABLED==='true'):tierChangesEnabled();
 if(!enabled)throw Error('disabled');
 const key=process.env.UPGRADE_SANDBOX_STRIPE_SECRET_KEY||'';
 if(preview&&!/^(sk|rk)_test_/.test(key))throw Error('Test Stripe credentials required');
 if(!preview&&stripeMode()!=='live')throw Error('Live Stripe mode required');
 const stripe:typeof stripeRequest=preview?async(path,init={})=>{
  const response=await fetch('https://api.stripe.com/v1'+path,{method:init.method||'GET',headers:{
   Authorization:'Bearer '+key,'Content-Type':'application/x-www-form-urlencoded',
   ...(init.idempotencyKey?{'Idempotency-Key':init.idempotencyKey}:{})},
   ...(init.method==='POST'?{body:init.body}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const payload=await response.json();
  if(!response.ok)throw Error('Stripe operation failed: '+String(payload.error?.code||response.status));
  return payload;
 }:stripeRequest;
 const url=process.env.UPGRADE_SANDBOX_DATABASE_URL;
 if(preview&&!url)throw Error('Isolated database missing');
 const sql=preview?neon(url!):membershipDb();
 const branch=await sql`SELECT current_setting('neon.branch_id',true) AS id`;
 if(branch.length!==1||branch[0].id!==(preview?'br-young-salad-aubnf7xt':'br-sparkling-glitter-aucpz59d'))throw Error('Database branch mismatch');
 // The server-approved price IDs can only be read with credentials belonging
 // to their Stripe account. Avoid /v1/account: restricted keys do not require
 // Accounts Read just to verify the subscription tier prices.
 const map=obj(JSON.parse(process.env[preview?'TEST_FOUR_TIER_PRICE_CATALOG':'LIVE_FOUR_TIER_PRICE_CATALOG']||'{}'));
 if(Object.keys(map).length!==4||new Set(Object.values(map)).size!==4||tiers.some(t=>!/^price_[A-Za-z0-9]+$/.test(String(map[t.tier]))))throw Error('Tier catalog missing');
 const catalog=await Promise.all(tiers.map(async t=>{
  const price=await stripe('/prices/'+map[t.tier]),rec=obj(price.recurring);
  if(price.livemode!==!preview||price.active!==true||price.currency!=='usd'||price.unit_amount!==t.cents||rec.interval!=='month'||rec.interval_count!==1||rec.usage_type!=='licensed')throw Error('Tier price mismatch');
  return {...t,price:String(price.id)};
 }));
 return {sql,stripe,catalog,live:!preview};
}
export async function tierMember(){
 const user=await currentUser();
 const primary=user?.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);
 const email=String(primary?.emailAddress||'').trim().toLowerCase();
 if(!user||primary?.verification?.status!=='verified')throw Error('Sign in with your verified member email.');
 const runtime=await tierRuntime();
 const {sql,stripe}=runtime;
 const members=await sql`SELECT * FROM public.fitness_memberships WHERE email=${email} LIMIT 2`;
 const m=members[0];
 if(members.length!==1||m.access_active!==true||!/^cus_[A-Za-z0-9]+$/.test(String(m.stripe_customer_id))||!/^sub_[A-Za-z0-9]+$/.test(String(m.stripe_subscription_id)))throw Error('Membership is not verified.');
 const memberKey=sharedUsageMemberKey(email,process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET||'');
 if(!memberKey)throw Error('Member key unavailable');
 const [customer,sub,list]=await Promise.all([stripe('/customers/'+m.stripe_customer_id),stripe('/subscriptions/'+m.stripe_subscription_id),stripe('/subscriptions?customer='+m.stripe_customer_id+'&status=all&limit=100')]);
 const others=(Array.isArray(list.data)?list.data:[]).filter(s=>s.id!==m.stripe_subscription_id&&!['canceled','incomplete_expired'].includes(s.status));
 const items=obj(sub.items),data=Array.isArray(items.data)?items.data:[],item=obj(data[0]);
 if(customer.deleted||String(customer.email||'').trim().toLowerCase()!==email||sub.customer!==m.stripe_customer_id||sub.livemode!==runtime.live||sub.status!=='active'||list.has_more||others.length||data.length!==1||items.has_more||item.quantity!==1)throw Error('Subscription is not changeable.');
 const bound=await bindVerifiedTierMemberIdentity({membership:m,userId:user.id,email,customer,subscription:sub,persist:()=>sql`
  UPDATE public.fitness_memberships
  SET clerk_user_id=${user.id}, updated_at=NOW()
  WHERE email=${email}
   AND stripe_customer_id=${String(m.stripe_customer_id)}
   AND stripe_subscription_id=${String(m.stripe_subscription_id)}
   AND clerk_user_id IS NOT DISTINCT FROM ${m.clerk_user_id??null}
  RETURNING *
 `});
 return {...runtime,user,email,memberKey,m:bound,sub,item,current:runtime.catalog.find(t=>t.price===obj(item.price).id)};
}
