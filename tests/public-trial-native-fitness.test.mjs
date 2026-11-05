import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const r=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const fitness=r("../app/api/fitness/chat/route.ts");
const trial=r("../app/api/introductory-trial/chat/route.ts");
const api=r("../app/api/introductory-trial/workouts/route.ts");
test("trial Fitness reuses existing member-scoped saved workout validation rather than inventing new tool writes",()=>{
 assert.match(fitness,/export async function executeVerifiedTrialFitnessTurn/);
 assert.match(fitness,/assessVerifiedPublicTrialUser\(user\.id\)/);
 assert.match(fitness,/result\.kind==="resume"/);
 assert.match(fitness,/verifiedTrial\.clerkId===user\.id/);
 assert.match(fitness,/return await postFitnessWithoutPreviewMeter\(request,\{clerkId,email\}\)/);
 assert.match(fitness,/if\(!trialIdentityMatches\)/);
 assert.match(fitness,/confirmSavedMutation\(/);
 assert.match(fitness,/writePlanMemory\(memberEmail,studioToken/);
 assert.ok(trial.indexOf("reservePublicTrialTurn(account,coach,key)")<trial.indexOf("executeVerifiedTrialFitnessTurn(nativeRequest,user.id,email)"));
 assert.match(trial,/storePublicTrialTurn\(account,coach,key,message\.trim\(\),answer\)/);
});
test("trial workout reader is tied to verified Clerk identity and same native saved memory",()=>{
 assert.match(api,/currentUser\(\)/);
 assert.match(api,/primary\?\.verification\?\.status!=="verified"/);
 assert.match(api,/readVerifiedTrialFitnessWorkouts\(user\.id,email\)/);
 assert.match(fitness,/return readMemberWorkoutData\(email,studioToken\)/);
});
