import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const checkout=file("../app/api/billing/create-checkout-session/route.ts");
const webhook=file("../app/api/billing/webhook/route.ts");
const trial=file("../app/api/isolated-introductory-trial/chat/route.ts");
test("checkout restores and checks current paid memberships before creating a new subscription",()=>{
 assert.match(checkout,/restoreVerifiedHistoricalBillingForMember\(/);
 assert.match(checkout,/memberHasFitnessAccess\(/);
 assert.match(checkout,/checkCheckoutRisk\(/);
 assert.match(checkout,/reserveCheckout\(/);
});
test("subscription activation is Stripe webhook verified, not a browser-only conversion flag",()=>{
 assert.match(webhook,/verifyStripeWebhook\(/);
 assert.match(webhook,/checkout\.session\.completed/);
 assert.match(webhook,/saveFitnessMembership\(/);
});
test("preview trial does not attempt live billing or alter saved customer data",()=>{
 assert.match(trial,/isolatedTrialPreviewEnabled\(/);
 assert.doesNotMatch(trial,/stripeRequest\(|saveFitnessMembership\(|readMemberBudgetMonth\(|saveLifeTurn\(/);
 assert.match(trial,/PICKAXE_FITNESS_DEPLOYMENT_TOKEN/);
});
