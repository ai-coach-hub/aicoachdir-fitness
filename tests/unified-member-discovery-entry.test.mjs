import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source=readFileSync(new URL("../lib/fitnessMembershipDb.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const email="previously-paid@example.test", id="user_ExistingSubscriber1234";

function scenario({historical={customerId:"cus_OldMember01",subscriptionId:"sub_OldMember01",status:"active",active:true},current=null,verifiedPickaxe=false}={}){
 let row=current?{email,clerk_user_id:id,...current}:null;
 const operations=[], sql=async(strings,...vals)=>{
  const q=strings.join("?");
  if(/^\s*(CREATE|ALTER)\s/i.test(q))return [];
  if(q.includes("SELECT *")&&q.includes("FROM fitness_memberships"))return row?[{...row}]:[];
  if(q.includes("INSERT INTO fitness_memberships")){
    operations.push("saved");
    row={email:vals[0],clerk_user_id:vals[1],stripe_customer_id:vals[2],
     stripe_subscription_id:vals[3],stripe_status:vals[4],access_active:vals[5],
     access_group_id:vals[6],last_event_type:vals[7],last_stripe_verified_at:vals[3]?new Date().toISOString():null};
    return [{...row}];
  }
  throw Error("Unexpected SQL "+q.slice(0,180));
 };
 const dependencies={
  "@neondatabase/serverless":{neon:()=>sql},
  "@/lib/memberIdentity":{canonicalMemberEmail:x=>String(x||"").trim().toLowerCase()},
  "@/lib/pickaxeAccess":{FITNESS_ACCESS_GROUP_ID:"access-valid",
   grantFitnessAccess:async()=>{operations.push("grant");},
   revokeFitnessAccess:async()=>{operations.push("revoke");},
   pickaxeUserHasFitnessAccess:async()=>{operations.push("pickaxe");return verifiedPickaxe;}},
  "@/lib/stripeMembershipState":{getVerifiedSubscription:async()=>{
    throw Error("linked billing should not be fetched from a freshly recovered row");}},
  "@/lib/stripeServer":{stripeSubscriptionIsActive:s=>["active","trialing"].includes(s)},
  "@/lib/legacyBillingVerification":{discoverVerifiedHistoricalBilling:async()=>{
    operations.push("historical");
    return historical;
  }}
 };
 const m={exports:{}};
 runInNewContext(js,{module:m,exports:m.exports,require:x=>{
  assert.ok(x in dependencies,"unhandled import "+x);return dependencies[x];
 },process:{env:{DATABASE_URL:"postgres://fake/test",VERCEL_ENV:"production"}},Date,console:{error:()=>{}}},{timeout:3000});
 return {check:clerkId=>m.exports.memberHasFitnessAccess(email,clerkId,{fallbackToPickaxeList:false}),
  operations,record:()=>row};
}
test("unlisted paid member is restored from verified historical billing on ANY verified Clerk access path",async()=>{
 const w=scenario();
 assert.equal(await w.check(id),true);
 assert.deepEqual(w.operations,["historical","saved","grant"]);
 assert.equal(w.record()?.stripe_subscription_id,"sub_OldMember01");
});
test("historically canceled subscription cannot regain access through an old Pickaxe group",async()=>{
 const w=scenario({historical:{customerId:"cus_OldMember01",subscriptionId:"sub_OldMember01",status:"canceled",active:false},verifiedPickaxe:true});
 assert.equal(await w.check(id),false);
 assert.deepEqual(w.operations,["historical","saved","revoke"]);
 assert.equal(w.record().access_active,false);
});
test("an email without an authenticated Clerk binding never triggers historical subscriber recovery",async()=>{
 const w=scenario({historical:null});
 assert.equal(await w.check(undefined),false);
 assert.deepEqual(w.operations,["pickaxe"]);
});
test("explicitly retired login cannot be recovered despite having a verified historical subscription",async()=>{
 const w=scenario({current:{stripe_status:"retired_owner_requested",access_active:false,
   stripe_customer_id:null,stripe_subscription_id:null},verifiedPickaxe:true});
 assert.equal(await w.check(id),false);
 assert.deepEqual(w.operations,[]);
});
