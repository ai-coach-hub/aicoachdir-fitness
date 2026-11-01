import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function loadRuntime(){
  const code=ts.transpileModule(readFileSync('lib/tierChangeRuntime.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const imports={
    '@neondatabase/serverless':{neon:()=>{}},
    '@clerk/nextjs/server':{currentUser:async()=>null},
    './fitnessMembershipDb':{membershipDb:()=>{}},
    './stripeServer':{stripeRequest:async()=>{},stripeMode:()=> 'test'},
    './sharedUsageMemberIdentity':{sharedUsageMemberKey:()=> 'member_test'},
  };
  const module={exports:{}};
  new Function('require','module','exports',code)(id=>imports[id],module,module.exports);
  return module.exports;
}

const membership=()=>({
  email:'member@example.com',
  clerk_user_id:'user_old',
  stripe_customer_id:'cus_test',
  stripe_subscription_id:'sub_test',
  access_active:true,
});

test('verified same-email Stripe ownership rebinds a stale Clerk identity',async()=>{
  const {bindVerifiedTierMemberIdentity}=loadRuntime();
  let persisted=membership();
  const result=await bindVerifiedTierMemberIdentity({
    membership:persisted,
    userId:'user_new',
    email:'member@example.com',
    customer:{id:'cus_test',email:'member@example.com',deleted:false},
    subscription:{id:'sub_test',customer:'cus_test',status:'active',livemode:false},
    persist:async()=>{
      persisted={...persisted,clerk_user_id:'user_new'};
      return [persisted];
    },
  });
  assert.equal(result.clerk_user_id,'user_new');
});

test('a Stripe email mismatch cannot change the Clerk binding',async()=>{
  const {bindVerifiedTierMemberIdentity}=loadRuntime();
  let persisted=false;
  await assert.rejects(bindVerifiedTierMemberIdentity({
    membership:membership(),
    userId:'user_new',
    email:'member@example.com',
    customer:{id:'cus_test',email:'other@example.com',deleted:false},
    subscription:{id:'sub_test',customer:'cus_test',status:'active',livemode:false},
    persist:async()=>{persisted=true;return [];},
  }),/Membership is not verified/);
  assert.equal(persisted,false);
});
