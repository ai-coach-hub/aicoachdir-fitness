import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const verifier=src("../lib/publicIntroductoryTrialPreflight.ts");
const endpoint=src("../app/api/introductory-trial/preflight/route.ts");
test("preflight checks verified Clerk and both historic billing systems",()=>{
 assert.match(verifier,/currentUser\(\)/);
 assert.match(verifier,/primary\.verification\?\.status!=="verified"/);
 assert.match(verifier,/PROD_NEON_BRANCH/);
 assert.match(verifier,/stripePreviouslySubscribed\(email\)/);
 assert.match(verifier,/getPickaxeUser\(email/);
 assert.match(verifier,/pickaxeUserHasFitnessAccess\(email/);
 assert.match(verifier,/member_key=\$\{memberKey\} OR clerk_user_id=\$\{user\.id\}/);
 assert.match(verifier,/TERMS_VERSION/);
 assert.match(verifier,/included_uses=15/);
});
test("read-only preflight never mints grants or paid records and stays release-gated",()=>{
 assert.match(verifier,/publicTrialReleaseGate\(process\.env\)/);
 assert.match(endpoint,/isPublicTrialPreflightAvailable\(\)/);
 assert.doesNotMatch(verifier+endpoint,/INSERT INTO|UPDATE public|DELETE FROM|saveFitnessMembership\(|grantFitnessAccess\(|SELECT public\.intro_trial_reserve\(/);
 assert.doesNotMatch(endpoint,/export async function POST/);
 assert.match(endpoint,/verification_unavailable/);
});
test("historical Stripe errors fail closed and every paid status blocks a new trial",()=>{
 assert.match(verifier,/subs\.data\.length>0\)return true/);
 assert.match(verifier,/subs\.has_more!==false/);
 assert.match(verifier,/listed\.has_more!==false/);
 assert.match(verifier,/return noAccess\("lifetime_history_unknown"\)/);
});
