import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/isolated-introductory-trial/paid-continuation-readiness/route.ts",import.meta.url),"utf8");
test("paid continuation readiness is strictly test-only and read-only",()=>{
 assert.match(route,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(route,/verifiedIsolatedPaidContinuation\(\)/);
 assert.match(route,/paidMessagesReady:true/);
 assert.match(route,/paidMessagesReady:false/);
 assert.doesNotMatch(route,/INSERT INTO|UPDATE public|DELETE FROM|stripeRequest\(|api\.pickaxe\.co/);
});
