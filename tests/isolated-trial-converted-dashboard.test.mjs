import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const dashboard=src("../app/dashboard/page.tsx");
const privateView=src("../components/ConvertedTrialDashboard.tsx");
test("only converted synthetic member can use the isolated dashboard",()=>{
 assert.match(dashboard,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(dashboard,/user\.id===process\.env\.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(dashboard,/await assertIsolatedTrialTestCheckout\(\)/);
 assert.match(dashboard,/introHistorySql\(\)/);
 assert.match(dashboard,/grants\[0\]\.converted_at!=null/);
 assert.match(dashboard,/members\[0\]\.access_active===true/);
 assert.match(dashboard,/stripe_customer_id IS NOT NULL AND stripe_subscription_id IS NOT NULL/);
 assert.match(dashboard,/return <ConvertedTrialDashboard/);
 assert.match(dashboard,/memberHasFitnessAccess\(email, user\.id\)/);
});
test("converted dashboard is read-only and shows all three saved coach histories",()=>{
 assert.match(privateView,/readTrialTurns\(userId\)/);
 assert.match(privateView,/\["fitness","budgeting","life"\]/);
 assert.match(privateView,/cleanLifeCoachText\(String\(t\.coach_response\)\)/);
 assert.match(privateView,/Continued coaching through the normal paid chat pages has not yet been connected/);
 assert.doesNotMatch(privateView,/stripeRequest\(|saveFitnessMembership\(|fetch\(|UPDATE\s|INSERT\s|DELETE\s/);
});
