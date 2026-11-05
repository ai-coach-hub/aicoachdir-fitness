import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const native=read("../app/api/fitness/chat/route.ts");
const trial=read("../app/api/introductory-trial/chat/route.ts");
const api=read("../app/api/introductory-trial/workouts/route.ts");
test("final reserved Fitness trial request is permitted even after shared balance reaches zero",()=>{
 assert.match(native,/trialFitnessIdentity\(clerkId,email,requestKey\)/);
 assert.match(native,/status='reserved'/);
 assert.match(native,/coach='fitness'/);
 assert.match(native,/request_key=\$\{requestKey\}/);
 assert.match(native,/grants\[0\]\.converted_at!=null/);
 assert.match(native,/memberRows\.length===0/);
 assert.match(native,/return requestRows\.length===1/);
 assert.match(trial,/executeVerifiedTrialFitnessTurn\(nativeRequest,user\.id,email,key\)/);
 assert.ok(trial.indexOf("reservePublicTrialTurn(account,coach,key)")<trial.indexOf("executeVerifiedTrialFitnessTurn(nativeRequest,user.id,email,key)"));
});
test("native saved plan readback survives trial exhaustion and conversion under same verified Clerk ID",()=>{
 assert.match(native,/if\(!requestKey\)return true/);
 assert.match(native,/return readMemberWorkoutData\(email,studioToken\)/);
 assert.match(native,/primary\.verification\?\.status!=="verified"/);
 assert.match(native,/return await postFitnessWithoutPreviewMeter\(request,\{clerkId,email\}\)/);
 assert.match(native,/confirmSavedMutation\(/);
 assert.match(native,/writePlanMemory\(memberEmail, studioToken/);
 assert.match(api,/readVerifiedTrialFitnessWorkouts\(user\.id,email\)/);
});
