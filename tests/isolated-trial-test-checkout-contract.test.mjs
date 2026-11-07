import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const safety=read("../lib/isolatedTrialCheckoutSafety.ts");
const checkout=read("../app/api/isolated-introductory-trial/checkout/route.ts");
const success=read("../app/introductory-preview/checkout/success/page.tsx");
const page=read("../app/introductory-preview/page.tsx");
test("private test checkout is only available on an isolated test branch",()=>{
 assert.match(safety,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(safety,/stripeMode\(\)!=="test"/);
 assert.match(safety,/br-spring-cloud-aui2mogd/);
 assert.match(checkout,/await assertIsolatedTrialTestCheckout\(\)/);
 assert.match(success,/await assertIsolatedTrialTestCheckout\(\)/);
 assert.doesNotMatch(checkout,/sk_live_|rk_live_|grantFitnessAccess/);
 assert.doesNotMatch(success,/grantFitnessAccess|revokeFitnessAccess/);
});
test("test checkout is account-bound and never lets the browser pick a real Stripe price",()=>{
 assert.match(checkout,/resolveIsolatedIntroductoryAccount\(\)/);
 assert.match(checkout,/line_items\[0\]\[price_data\]\[unit_amount\]/);
 assert.match(checkout,/intro-preview-growth-/);
 assert.match(checkout,/session\.livemode!==false/);
 assert.match(checkout,/checkout\.stripe\.com/);
 assert.doesNotMatch(checkout,/await request\.json\(\)/);
 assert.match(page,/startTestCheckout/);
 assert.match(page,/Open Stripe TEST checkout/);
});
test("test conversion verifies Stripe customer and subscription and keeps trial history",()=>{
 for(const name of ["payment_status","client_reference_id","intro_trial_preview","customerId","subscriptionId"])
  assert.ok(success.includes(name),name);
 assert.match(success,/customer\.livemode!==false/);
 assert.match(success,/stripeSubscriptionIsActive/);
 assert.match(success,/await saveFitnessMembership\(/);
 assert.match(success,/await finalizeIsolatedTrialConversion\(/);
 assert.match(success,/await readTrialTurns\(user\.id\)/);
 assert.ok(success.indexOf("await saveFitnessMembership(")<success.indexOf("await finalizeIsolatedTrialConversion("));
});
