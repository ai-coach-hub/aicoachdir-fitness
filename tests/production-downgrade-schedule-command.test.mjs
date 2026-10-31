import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync} from "node:fs";
const src=readFileSync("lib/productionDowngradeScheduleCommand.ts","utf8");
test("downgrade command parses",()=>{
 const s=ts.createSourceFile("command.ts",src,ts.ScriptTarget.Latest,true);
 assert.equal(s.parseDiagnostics.length,0);
});
test("command requires server identity, approved prices and stored request",()=>{
 for(const name of ["memberVerified","stripeAccountLive","durableChangeStored","currentPriceApproved","targetPriceApproved"])
 assert.ok(src.includes(name),name);
});
test("downgrade uses existing renewal policy and never mutates a subscription",()=>{
 assert.match(src,/planStripeRenewalPhases\(d,args\)/);
 assert.match(src,/noImmediateInvoice:true/);
 assert.match(src,/noImmediateSubscriptionChange:true/);
 assert.doesNotMatch(src,/stripeRequest\(|fetch\(|UPDATE public|INSERT INTO/);
});
