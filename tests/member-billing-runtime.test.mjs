import test from "node:test";import assert from "node:assert/strict";import {readFile} from "node:fs/promises";
const read=async path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("page and portal rely on same verified identity resolver",async()=>{
 const page=await read("app/manage-subscription/page.tsx");
 const portal=await read("app/api/billing/customer-portal/route.ts");
 assert.match(page,/resolveMemberBillingCustomer\(/);
 assert.match(portal,/resolveMemberBillingCustomer\(/);
});
test("legacy link never comes from just an email address",async()=>{
 const lookup=await read("lib/memberBillingLookup.ts");
 assert.match(lookup,/getPickaxeUser\(/);
 assert.match(lookup,/decideBillingIdentity\(/);
 assert.match(lookup,/STUDIOFEB9DXAKH9BA0QAXYBA6/);
 assert.doesNotMatch(lookup,/\/checkout\/sessions/);
});
test("portfolio read supports both website and legacy without mutating membership",async()=>{
 const lookup=await read("lib/memberBillingLookup.ts");
 assert.match(lookup,/\/customers\/search/);
 assert.match(lookup,/\/subscriptions\?/);
 assert.doesNotMatch(lookup,/saveFitnessMembership|grantFitnessAccess|revokeFitnessAccess/);
});
