import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const store=read("../lib/lifeCoachStore.ts");
const api=read("../app/api/isolated-introductory-trial/native-life-goal/route.ts");
const ui=read("../app/introductory-preview/native-verification/page.tsx");
test("native Life Coach test writes only to the isolated trial database",()=>{
 assert.match(store,/isolatedTrialPreviewEnabled\(\)/);
 assert.match(store,/INTRODUCTORY_TRIAL_DATABASE_URL/);
 assert.match(store,/br-spring-cloud-aui2mogd/);
 assert.match(store,/return sql;/);
 assert.match(api,/if\(!isolatedTrialPreviewEnabled\(\)\)/);
 assert.match(api,/INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID/);
 assert.match(api,/primary\?\.verification\?\.status!=="verified"/);
 assert.match(api,/origin!=="https:\/\/"\+deployment/);
});
test("native Life goal action saves via existing Life Coach store and verifies readback",()=>{
 assert.match(api,/saveIntroductoryLifeGoal\(user\.id,key,goal\)/);
 assert.match(api,/listLifeGoals\(user\.id\)/);
 assert.match(api,/goals\.some\(g=>g\.text===goal\)/);
 assert.match(api,/const key="intro-native-life-goal-20261105"/);
 assert.match(ui,/Save and verify example Life goal/);
 assert.match(ui,/native-life-goal/);
 assert.doesNotMatch(api,/stripeRequest|checkout|shared_ai_reserve|intro_trial_reserve/);
});
