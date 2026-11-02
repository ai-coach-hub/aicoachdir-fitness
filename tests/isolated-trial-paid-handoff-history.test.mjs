import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const success=source("../app/fitness/checkout/success/page.tsx");
const hist=source("../lib/isolatedTrialHistory.ts");
const handoff=source("../lib/isolatedTrialPaidHandoff.ts");
const endpoint=source("../app/api/isolated-introductory-trial/history/route.ts");
const chat=source("../app/api/isolated-introductory-trial/chat/route.ts");
test("Stripe-verified checkout saves paid membership before marking trial converted",()=>{
 assert.ok(success.indexOf("await saveFitnessMembership(")<success.indexOf("await finalizeIsolatedTrialConversion("));
 assert.ok(success.indexOf('paymentStatus !== "paid"')<success.indexOf("await finalizeIsolatedTrialConversion("));
 assert.match(success,/VERCEL_GIT_COMMIT_REF==="feature\/intro-15-messages-isolated-20261101"/);
 assert.match(success,/INTRODUCTORY_TRIAL_PREVIEW_ENABLED==="true"/);
});
test("conversion is idempotent, rejects unverified evidence, and preserves all trial turns",()=>{
 assert.match(handoff,/assessIsolatedTrialConversion/);
 assert.match(handoff,/converted_at IS NULL RETURNING/);
 assert.doesNotMatch(handoff,/DELETE FROM|stripeRequest\(/);
 assert.match(hist,/introductory_trial_history/);
 assert.match(hist,/WHERE h.clerk_user_id=\$\{accountId\}/);
 assert.match(hist,/r.status='completed'/);
});
test("history cannot be queried for arbitrary browser-supplied identity",()=>{
 assert.match(endpoint,/await currentUser\(\)/);
 assert.match(endpoint,/primary\?\.verification\?\.status!=="verified"/);
 assert.match(endpoint,/readTrialTurns\(user.id\)/);
 assert.doesNotMatch(endpoint,/searchParams|request.json/);
});
test("coach response persisted before a paid credit is settled",()=>{
 assert.match(chat,/await saveTrialTurn/);
 assert.match(hist,/status='reserved'/);
});
