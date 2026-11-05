import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const launch=get("../app/introductory-trial/budget/route.ts");
const proof=get("../app/api/introductory-trial/budget-attest/route.ts");
const signing=get("../lib/publicTrialBudgetSigning.ts");
test("budget handoff is an authenticated short-lived trial-only redirect",()=>{
 assert.match(launch,/assessVerifiedPublicTrialUser\(user\.id\)/);
 assert.match(launch,/admission\.kind!=="resume"/);
 assert.match(launch,/admission\.reason==="trial_exhausted"/);
 assert.match(launch,/Date\.now\(\)\+90_000/);
 assert.match(launch,/trialBudgetHandoffSignature\(email,user\.id,expires\)/);
 assert.match(launch,/Referrer-Policy/);
 assert.doesNotMatch(launch,/grantFitnessAccess\(|saveFitnessMembership\(|budget-membership/);
});
test("budget attestation requires signing, original member and positive shared credits",()=>{
 assert.match(proof,/verifyTrialBudgetAttestation/);
 assert.match(proof,/productionTrialSql\(\)/);
 assert.match(proof,/member_key=\$\{key\}/);
 assert.match(proof,/clerk_user_id=\$\{clerk\}/);
 assert.match(proof,/members\.length\|\|grants\.length!==1/);
 assert.match(proof,/remaining<0/);
 assert.match(signing,/timingSafeEqual/);
 assert.match(signing,/trial-budget-attestation-v1/);
 assert.match(signing,/Math\.abs\(Number\(issued\)-now\)>30_000/);
 assert.doesNotMatch(proof,/UPDATE public|INSERT INTO|DELETE FROM|grantFitnessAccess\(/);
});
