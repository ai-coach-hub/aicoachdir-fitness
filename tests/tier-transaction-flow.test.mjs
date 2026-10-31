import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
function load(){
 const path='lib/tierTransactionOperations.ts';
 assert.ok(existsSync(path),'transaction execution must exist');
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};new Function('module','exports',code)(m,m.exports);return m.exports;
}
const intent=()=>({id:'upg_'+'a'.repeat(36),stripe_subscription_id:'sub_test',stripe_item_id:'si_test',stripe_customer_id:'cus_test',old_price_id:'price_old',target_price_id:'price_new',proration_date:1793400000,quoted_amount:1000,state:'prepared',invoice_id:null,created_at:new Date().toISOString()});
test('retry sends exactly the original Stripe request and binds its returned invoice',async()=>{
 const {executeUpgrade}=load();const i=intent(),calls=[];
 const deps={claim:async()=>{},bind:async(id)=>{i.invoice_id=id},stripe:async(path,opts)=>{calls.push({path,opts});return {id:'sub_test',customer:'cus_test',latest_invoice:'in_test'};}};
 const r=await executeUpgrade(i,deps);
 assert.equal(r,'in_test');assert.equal(calls.length,1);
 assert.equal(calls[0].opts.body.get('proration_date'),'1793400000');
 assert.equal(calls[0].opts.body.get('payment_behavior'),'pending_if_incomplete');
 assert.equal(calls[0].opts.idempotencyKey,'tier_upgrade_'+i.id);
 i.invoice_id=null;i.state='awaiting_payment';await executeUpgrade(i,deps);
 assert.equal(calls[1].opts.body.toString(),calls[0].opts.body.toString());
 assert.equal(calls[1].opts.idempotencyKey,calls[0].opts.idempotencyKey);
});
test('a bound invoice prevents a second mutation',async()=>{
 const {executeUpgrade}=load();const i={...intent(),invoice_id:'in_existing'};
 assert.equal(await executeUpgrade(i,{stripe:()=>assert.fail('must not charge'),claim:()=>assert.fail(),bind:()=>assert.fail()}),'in_existing');
});
test('an old ambiguous request cannot recreate a charge after Stripe idempotency expiry',async()=>{
 const {executeUpgrade}=load();const i={...intent(),state:'awaiting_payment',created_at:'2020-01-01'};
 await assert.rejects(executeUpgrade(i,{stripe:()=>assert.fail('must not charge'),claim:()=>assert.fail(),bind:()=>assert.fail()}),/review/);
});
test('downgrade preserves current phase through renewal and does not invoice immediately',()=>{
 const {downgradeBody}=load();const b=downgradeBody({start:100,end:200,currentPrice:'price_old',targetPrice:'price_new'});
 assert.equal(b.get('phases[0][items][0][price]'),'price_old');
 assert.equal(b.get('phases[0][end_date]'),'200');
 assert.equal(b.get('phases[1][start_date]'),'200');
 assert.equal(b.get('phases[1][items][0][price]'),'price_new');
 assert.equal(b.get('proration_behavior'),'none');assert.equal(b.get('end_behavior'),'release');
});
