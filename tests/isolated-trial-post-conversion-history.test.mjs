import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const page=src("../app/introductory-preview/paid/page.tsx");
const success=src("../app/introductory-preview/checkout/success/page.tsx");
const trial=src("../app/introductory-preview/page.tsx");
test("converted test history is read-only, authenticated, and private",()=>{
 assert.match(page,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(page,/await currentUser\(\)/);
 assert.match(page,/verification\?\.status!=="verified"/);
 assert.match(page,/clerk_user_id=\$\{user\.id\}/);
 assert.match(page,/converted_at==null/);
 assert.match(page,/access_active!==true/);
 assert.match(page,/stripe_customer_id IS NOT NULL AND stripe_subscription_id IS NOT NULL/);
 assert.match(page,/readTrialTurns\(user\.id\)/);
 assert.doesNotMatch(page,/INSERT INTO|UPDATE public|DELETE FROM|stripeRequest\(|saveFitnessMembership\(/);
});
test("converted accounts have a safe way back to their previously saved conversations",()=>{
 assert.match(success,/href="\/introductory-preview\/paid"/);
 assert.match(trial,/href="\/introductory-preview\/paid"/);
 assert.match(page,/cleanLifeCoachText\(String\(t\.coach_response\)\)/);
});
