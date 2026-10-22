import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source=readFileSync(new URL("../lib/fitnessMembershipDb.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const email="existing-legacy@example.test";
const userId="user_LegacyAccount12345";
function fixture({hasPickaxeAccess=true,billing=null,verifyError=null,groupError=null}={}){
 let row={email,clerk_user_id:userId,access_active:true,
  stripe_status:"legacy_pickaxe_member",stripe_customer_id:null,
  stripe_subscription_id:null,last_legacy_verified_at:null};
 const calls=[];
 const sql=async(strings,...values)=>{
  const statement=strings.join("?");
  if(/^\s*(CREATE|ALTER)\s/i.test(statement))return [];
  if(statement.includes("SELECT *")&&statement.includes("FROM fitness_memberships"))return row?[{...row}]:[];
  if(statement.includes("UPDATE fitness_memberships SET last_legacy_verified_at = NOW()")){
   calls.push("stamp");
   row={...row,last_legacy_verified_at:new Date().toISOString()};
   return [];
  }
  if(statement.includes("UPDATE fitness_memberships SET\n      stripe_customer_id")){
   calls.push("linked-billing");
   row={...row,stripe_customer_id:values[0],stripe_subscription_id:values[1],
    stripe_status:values[2],access_active:values[3],
    last_legacy_verified_at:new Date().toISOString(),
    last_stripe_verified_at:new Date().toISOString()};
   return [{...row}];
  }
  throw Error("Unexpected SQL: "+statement.slice(0,200));
 };
 const dependencies={
  "@neondatabase/serverless":{neon:()=>sql},
  "@/lib/memberIdentity":{canonicalMemberEmail:v=>String(v||"").trim().toLowerCase()},
  "@/lib/pickaxeAccess":{
   FITNESS_ACCESS_GROUP_ID:"access-only-in-sandbox",
   grantFitnessAccess:async()=>{calls.push("grant");},
   revokeFitnessAccess:async()=>{calls.push("revoke");},
   pickaxeUserHasFitnessAccess:async(m,options)=>{
    calls.push("pickaxe-access");
    assert.equal(m,email);
    if(groupError)throw groupError;
    return hasPickaxeAccess;
   }
  },
  "@/lib/stripeMembershipState":{getVerifiedSubscription:async()=>{throw Error("unexpected Stripe call");}},
  "@/lib/stripeServer":{stripeSubscriptionIsActive:status=>["active","trialing"].includes(status)},
  "@/lib/legacyBillingVerification":{
   discoverVerifiedHistoricalBilling:async(m)=>{
    calls.push("historical-billing");
    assert.equal(m,email);
    if(verifyError)throw verifyError;
    return billing;
   }
  }
 };
 const module={exports:{}};
 runInNewContext(code,{module,exports:module.exports,require:p=>{
  assert.ok(p in dependencies,"unexpected import "+p);
  return dependencies[p];
 },process:{env:{VERCEL_ENV:"production",DATABASE_URL:"postgres://sandbox.invalid/test-only"}},Date,console:{error:()=>{}}},{timeout:3000});
 return {access:()=>module.exports.memberHasFitnessAccess(email,userId,{fallbackToPickaxeList:false}),
  row:()=>row,calls};
}

test("grandfathered member without an old Stripe subscription earns fresh verification only when actual Pickaxe access is still active",async()=>{
 const x=fixture();
 assert.equal(await x.access(),true);
 assert.deepEqual(x.calls,["historical-billing","pickaxe-access","stamp"]);
 assert.ok(x.row().last_legacy_verified_at);
 assert.equal(x.row().stripe_subscription_id,null);
});

test("missing Pickaxe access never stamps an unverified legacy allowance, while existing Fitness access is unchanged",async()=>{
 const x=fixture({hasPickaxeAccess:false});
 assert.equal(await x.access(),true);
 assert.deepEqual(x.calls,["historical-billing","pickaxe-access"]);
 assert.equal(x.row().last_legacy_verified_at,null);
 assert.equal(x.row().access_active,true);
});

test("historical billing or Pickaxe lookup outage never manufactures a verified date or removes existing access",async()=>{
 for(const options of [{verifyError:Error("Stripe unavailable")},
  {groupError:Error("Pickaxe unavailable")}]){
  const x=fixture(options);
  assert.equal(await x.access(),true);
  assert.equal(x.row().last_legacy_verified_at,null);
  assert.equal(x.row().access_active,true);
  assert.ok(!x.calls.includes("stamp"));
 }
});

test("matched historical canceled subscription is linked as inactive before any shared wallet can be issued",async()=>{
 const x=fixture({billing:{customerId:"cus_Example123",subscriptionId:"sub_Example123",
  status:"canceled",active:false}});
 assert.equal(await x.access(),false);
 assert.equal(x.row().access_active,false);
 assert.ok(x.calls.includes("linked-billing"));
 assert.ok(!x.calls.includes("stamp"));
 assert.ok(!x.calls.includes("pickaxe-access"));
});