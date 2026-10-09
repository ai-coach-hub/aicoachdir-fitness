import test from "node:test";
import assert from "node:assert/strict";
import { decideBillingIdentity, extractPickaxeIdentity } from "../lib/memberBillingIdentityCore.mjs";
const base={email:"member@example.com",clerkUserId:"user_123",customerId:"cus_A1",subscriptionId:"sub_A1",status:"active",metadata:{member_email:"member@example.com",clerk_user_id:"user_123"},source:"website"};
const legacy={...base,source:"pickaxe",metadata:{studioId:"STUDIO1",studioUserId:"pickaxe_42"},pickaxe:{email:"member@example.com",id:"pickaxe_42"},studioId:"STUDIO1"};
test("website billing requires same Clerk identity and member email",()=>{
 assert.equal(decideBillingIdentity({email:base.email,clerkUserId:base.clerkUserId,customers:[{id:base.customerId,email:base.email}],subscriptions:[base]}).outcome,"linked");
 assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_other",customers:[{id:base.customerId,email:base.email}],subscriptions:[base]}).outcome,"linked");
});
test("Pickaxe billing requires matching studio and provider user ID",()=>{
 assert.equal(decideBillingIdentity({email:base.email,clerkUserId:"user_123",studioId:"STUDIO1",pickaxe:legacy.pickaxe,customers:[{id:legacy.customerId,email:base.email}],subscriptions:[legacy]}).outcome,"linked");
 assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_123",studioId:"STUDIO1",pickaxe:{...legacy.pickaxe,id:"pickaxe_other"},customers:[{id:legacy.customerId,email:base.email}],subscriptions:[legacy]}).outcome,"linked");
 assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_123",studioId:"STUDIO2",pickaxe:legacy.pickaxe,customers:[{id:legacy.customerId,email:base.email}],subscriptions:[legacy]}).outcome,"linked");
});
test("email alone never authorizes legacy billing",()=>assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_123",studioId:"STUDIO1",customers:[{id:legacy.customerId,email:base.email}],subscriptions:[legacy]}).outcome,"linked"));
test("duplicate Stripe customers fail closed",()=>assert.equal(decideBillingIdentity({email:base.email,clerkUserId:"user_123",customers:[{id:base.customerId,email:base.email},{id:"cus_B2",email:base.email}],subscriptions:[base]}).outcome,"ambiguous"));
test("duplicate active subscriptions fail closed",()=>assert.equal(decideBillingIdentity({email:base.email,clerkUserId:"user_123",customers:[{id:base.customerId,email:base.email}],subscriptions:[base,{...base,subscriptionId:"sub_B2"}]}).outcome,"ambiguous"));
test("inactive subscription cannot create a portal link",()=>assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_123",customers:[{id:base.customerId,email:base.email}],subscriptions:[{...base,status:"canceled"}]}).outcome,"linked"));
test("period-end cancellation stays eligible until paid-through timestamp",()=>{
 const sub={...base,cancelAtPeriodEnd:true,currentPeriodEnd:2000};
 assert.equal(decideBillingIdentity({email:base.email,clerkUserId:"user_123",customers:[{id:base.customerId,email:base.email}],subscriptions:[sub],now:1999}).outcome,"linked");
 assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_123",customers:[{id:base.customerId,email:base.email}],subscriptions:[sub],now:2000}).outcome,"linked");
});
test("Pickaxe wrapper requires explicit exact email and id",()=>{
 assert.deepEqual(extractPickaxeIdentity({data:{email:" MEMBER@EXAMPLE.COM ",id:"pickaxe_42"}}),{email:"member@example.com",id:"pickaxe_42"});
 assert.equal(extractPickaxeIdentity({data:{id:"pickaxe_42"}}),null);
 assert.equal(extractPickaxeIdentity({data:{email:"different@example.com"}}),null);
});
test("customer email mismatch fails closed",()=>assert.notEqual(decideBillingIdentity({email:base.email,clerkUserId:"user_123",customers:[{id:base.customerId,email:"other@example.com"}],subscriptions:[base]}).outcome,"linked"));
