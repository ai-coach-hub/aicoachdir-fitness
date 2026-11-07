import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../app/api/introductory-trial/goals/route.ts",import.meta.url),"utf8");
test("native trial goals belong to the same Clerk ID and member key as paid Life",()=>{
 assert.match(src,/currentUser\(\)/);
 assert.match(src,/verification\?\.status!=="verified"/);
 assert.match(src,/member_key=\$\{key\}/);
 assert.match(src,/clerk_user_id=\$\{user\.id\}/);
 assert.match(src,/listLifeGoals\(user\.id\)/);
});
test("goal access does not require new trial credits but retains schema and review gates",()=>{
 assert.match(src,/PUBLIC_INTRO_TRIAL_SCHEMA_READY/);
 assert.match(src,/PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED/);
 assert.doesNotMatch(src,/stripeRequest\(|reservePublicTrialTurn\(|INSERT INTO|UPDATE public|DELETE FROM/);
});
