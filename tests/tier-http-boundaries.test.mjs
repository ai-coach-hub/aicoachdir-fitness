import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
function route(path,imports){
 const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(id=>{
  if(id==='next/server')return {NextResponse:{json:(value,options)=>Response.json(value,options)}};
  if(id==='node:crypto')return {createHmac,timingSafeEqual:(a,b)=>a.equals(b)};
  if(imports[id])return imports[id];throw Error('Unknown import '+id);
 },m,m.exports);return m.exports;
}
const origin='https://preview.example';
test('prepare rejects cross-origin request before any authenticated service call',async()=>{
 const mod=route('app/api/billing/tier-change/prepare/route.ts',{'@/lib/tierChangeRuntime':{tierChangesEnabled:()=>true},'@/lib/tierChangeService':{prepareTierChange:()=>assert.fail('called service')}});
 const r=await mod.POST(new Request(origin+'/api',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{"targetTier":"elite"}'}));assert.equal(r.status,403);
});
test('disabled transaction route never calls Stripe or member services',async()=>{
 const mod=route('app/api/billing/tier-change/transaction/route.ts',{'@/lib/tierChangeRuntime':{tierChangesEnabled:()=>false},'@/lib/tierChangeService':{confirmTierChange:()=>assert.fail()}});
 assert.equal((await mod.POST(new Request(origin+'/api',{method:'POST',headers:{origin}}))).status,404);
});
test('unknown transaction action is rejected',async()=>{
 const mod=route('app/api/billing/tier-change/transaction/route.ts',{'@/lib/tierChangeRuntime':{tierChangesEnabled:()=>true},'@/lib/tierChangeService':{}});
 assert.equal((await mod.POST(new Request(origin+'/api',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"action":"giveCredits"}'}))).status,400);
});
test('signed webhook verifies mode, signature, retry response and renewal dispatch',async()=>{
 const names=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','UPGRADE_SANDBOX_WEBHOOK_ENABLED','UPGRADE_SANDBOX_STRIPE_WEBHOOK_SECRET'];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/production-tier-release-guards-20261029',UPGRADE_SANDBOX_WEBHOOK_ENABLED:'true',UPGRADE_SANDBOX_STRIPE_WEBHOOK_SECRET:'whsec_fixture'});
 let calls=0,fail=false;
 const mod=route('app/api/billing/tier-change/webhook/route.ts',{'@/lib/productionPaidUpgradeReconciler':{reconcileProductionPaidUpgrade:async()=>{calls++;if(fail)throw Error('temporary');return 'applied'}},'@/lib/tierRenewalReconciler':{reconcileTierRenewal:async()=>{calls++;return 'applied'},reconcileExpiredTierPayment:async()=>{calls++;return 'expired'}},'@/lib/newTierPaidWallet':{settleNewTierPaidInvoice:async()=> 'ignored'}});
 const request=(override={},valid=true)=>{
  const raw=JSON.stringify({livemode:false,type:'invoice.paid',data:{object:{id:'in_fixture',object:'invoice',livemode:false,billing_reason:'subscription_update'}},...override});
  const stamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256','whsec_fixture').update(stamp+'.'+raw).digest('hex');
  return new Request(origin+'/webhook',{method:'POST',body:raw,headers:{'stripe-signature':'t='+stamp+',v1='+(valid?signature:'0'.repeat(64))}});
 };
 try{
  assert.equal((await mod.POST(request({},false))).status,400);assert.equal(calls,0);
  await mod.POST(request({livemode:true}));assert.equal(calls,0);
  assert.equal((await mod.POST(request())).status,200);assert.equal(calls,1);
  fail=true;assert.equal((await mod.POST(request())).status,503);
  const r=await mod.POST(request({data:{object:{id:'in_renewal',object:'invoice',livemode:false,billing_reason:'subscription_cycle'}}}));
  assert.equal(r.status,200);assert.equal(calls,3);
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
