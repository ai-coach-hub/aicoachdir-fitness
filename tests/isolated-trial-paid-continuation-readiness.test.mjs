import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/isolated-introductory-trial/paid-continuation-readiness/route.ts",import.meta.url),"utf8");
test("converted paid-message readiness must fail closed without an isolated wallet",()=>{
 assert.match(route,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(route,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(route,/assertIsolatedTrialTestCheckout\(\)/);
 assert.match(route,/Stripe|stripeRequest/);
 assert.match(route,/sub\.livemode!==false/);
 assert.match(route,/customer\.livemode!==false/);
 assert.match(route,/paid_wallet_not_configured/);
 assert.match(route,/paidMessagesReady:false/);
 assert.doesNotMatch(route,/paidMessagesReady:true/);
 assert.doesNotMatch(route,/INSERT INTO|UPDATE public|DELETE FROM|stripeRequest\([^\n]*method:/);
 assert.doesNotMatch(route,/api\.pickaxe\.co|executeIsolatedIntroductoryMessage/);
});
