import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const converter=s("../lib/publicIntroductoryTrialConversion.ts");
const success=s("../app/fitness/checkout/success/page.tsx");
test("public conversion requires explicit production/schema gates and paid Stripe invoice",()=>{
 assert.match(converter,/VERCEL_ENV==="production"/);
 assert.match(converter,/PUBLIC_INTRO_TRIAL_CONVERSION_ENABLED==="true"/);
 assert.match(converter,/PUBLIC_INTRO_TRIAL_SCHEMA_READY==="true"/);
 assert.match(converter,/current_setting\('neon.branch_id'/);
 assert.match(converter,/stripeRequest\("\/subscriptions\//);
 assert.match(converter,/stripeRequest\("\/invoices\//);
 assert.match(converter,/invoice\.status!=="paid"/);
 assert.match(converter,/invoice\.livemode!==true/);
 assert.match(converter,/linked\[0\]\.access_active!==true/);
});
test("membership saved before converting; trial history never deleted, grant updated once",()=>{
 assert.ok(success.indexOf("await saveFitnessMembership(")<success.indexOf("await finalizePublicTrialPaidConversion("));
 assert.match(converter,/converted_at IS NULL/);
 assert.match(converter,/WHERE clerk_user_id=\$\{args\.clerkId\}/);
 assert.match(converter,/member_key=\$\{memberKey\}/);
 assert.doesNotMatch(converter,/DELETE FROM|grantFitnessAccess\(|saveFitnessMembership\(|method:"POST"/);
});
