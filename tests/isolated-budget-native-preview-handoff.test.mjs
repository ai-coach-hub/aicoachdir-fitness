import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const route=read("../app/api/isolated-introductory-trial/budget-handoff/route.ts");
const page=read("../app/introductory-preview/native-verification/page.tsx");
test("private Budgeting handoff requires original isolated Preview identity and converted test membership",()=>{
 assert.match(route,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(route,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(route,/verification\?\.status!=="verified"/);
 assert.match(route,/introHistorySql\(\)/);
 assert.match(route,/converted_at/);
 assert.match(route,/stripe_subscription_id IS NOT NULL/);
});
test("handoff has fixed private destination, 90s HMAC, no payments, no public trial flags",()=>{
 assert.match(route,/aicoachdir-budgeting-git-feature-introductory-trial-f7fdd5-kcb3\.vercel\.app/);
 assert.match(route,/trialBudgetHandoffSignature\(email,user\.id,expires\)/);
 assert.match(route,/Date\.now\(\)\+90_000/);
 assert.doesNotMatch(route,/stripeRequest\(|createCheckout\(|publicTrialReleaseGate/);
});
test("existing private verification screen exposes the new budget test link",()=>{
 assert.match(page,/href="\/api\/isolated-introductory-trial\/budget-handoff"/);
});
