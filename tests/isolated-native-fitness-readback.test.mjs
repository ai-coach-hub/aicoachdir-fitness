import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/api/isolated-introductory-trial/native-fitness/route.ts",import.meta.url),"utf8");
test("private Fitness check is isolated, signed-in, read-only and never claims a native save",()=>{
 assert.match(source,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(source,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(source,/verification\?\.status!=="verified"/);
 assert.match(source,/introHistorySql\(\)/);
 assert.match(source,/converted_at IS NOT NULL/);
 assert.match(source,/access_active=true/);
 assert.match(source,/readLegacyMemberPlan\(email,studioToken/);
 assert.match(source,/cacheReader:async memberEmail/);
 assert.match(source,/savedThroughCurrentTrialVerified:false/);
 assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|writeWorkoutPlanCache|ensureWorkoutPlanCacheSchema|fetch\("https:\/\/api\.pickaxe\.co\/v1\/completions")\b/i);
});
