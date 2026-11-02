import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../app/api/isolated-introductory-trial/chat/route.ts",import.meta.url),"utf8");
const identity=readFileSync(new URL("../lib/isolatedIntroductoryIdentity.ts",import.meta.url),"utf8");
const db=readFileSync(new URL("../lib/isolatedIntroductoryTrialDb.ts",import.meta.url),"utf8");
test("all three real coach provider calls share the isolated atomic usage boundary",()=>{
 assert.match(route,/\["fitness","budgeting","life"\]/);
 assert.match(route,/executeIsolatedIntroductoryMessage\(/);
 assert.match(route,/isolatedIntroductoryTrialPort/);
 assert.match(route,/api\.pickaxe\.co\/v1\/completions/);
 assert.ok(route.indexOf("executeIsolatedIntroductoryMessage(")<route.indexOf("fetch(\"https://api.pickaxe.co"));
});
test("preview gate and account verification occur before generation",()=>{
 assert.match(route,/if\(!isolatedTrialPreviewEnabled\(\)\)return reply\(\{ok:false,error:"Not found"\},404\)/);
 assert.match(route,/resolveIsolatedIntroductoryAccount\(\)/);
 assert.match(identity,/primary\.verification\?\.status!=="verified"/);
 assert.match(identity,/INTRODUCTORY_TRIAL_TEST_CLERK_IDS/);
 assert.match(identity,/if\(records\.length!==0\)return null/);
 assert.match(db,/TRIAL_BRANCH/);
 assert.match(db,/NEON_BRANCH/);
});
test("repeat request cannot spend extra credit and uncertain generation fails closed",()=>{
 assert.match(route,/duplicate_/);
 assert.match(route,/status==="exhausted"/);
 assert.match(route,/requires reconciliation/);
 assert.doesNotMatch(route,/memberHasFitnessAccess\(/);
 assert.doesNotMatch(route,/grantFitnessAccess\(/);
});
