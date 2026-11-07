import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const webhook=load("../app/api/billing/webhook/route.ts");
const handler=load("../app/fitness/checkout/success/page.tsx");
const conversion=load("../lib/publicIntroductoryTrialConversion.ts");

test("signed paid checkout webhook finalizes the same saved trial without requiring return to success page",()=>{
 const sig=webhook.indexOf("verifyStripeWebhook(rawBody, signature, origin)");
 const provision=webhook.indexOf("await setAccess({");
 const converted=webhook.indexOf("await finalizePublicTrialPaidConversion({");
 assert.ok(sig>=0&&provision>sig&&converted>provision);
 assert.match(webhook,/const paid = string\(object\.payment_status\) === "paid"/);
 assert.match(webhook,/stripeSubscriptionIsActive\(current\.status\)/);
 assert.match(webhook,/PUBLIC_INTRO_TRIAL_CONVERSION_ENABLED==="true"/);
 assert.match(webhook,/PUBLIC_INTRO_TRIAL_SCHEMA_READY==="true"/);
 assert.match(webhook,/clerkId:clerkUserId,email,customerId,subscriptionId/);
 assert.match(webhook,/\[intro-trial-public\] verified webhook conversion deferred/);
});
test("both conversion paths require matching live paid invoice; never create a second payment",()=>{
 assert.match(handler,/await finalizePublicTrialPaidConversion/);
 assert.match(conversion,/invoice\.livemode!==true/);
 assert.match(conversion,/invoice\.status!=="paid"/);
 assert.match(conversion,/invoice\.customer!==args\.customerId/);
 assert.match(conversion,/linked\[0\]\.stripe_subscription_id!==args\.subscriptionId/);
 assert.match(conversion,/AND converted_at IS NULL/);
 assert.doesNotMatch(conversion,/checkout\/sessions|method:"POST"|DELETE FROM|grantFitnessAccess\(/);
});
