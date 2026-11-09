import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = (path) => readFileSync(new URL(path,import.meta.url),"utf8");
const fitness = read("../app/fitness/chat/page.tsx");
const dashboard = read("../app/dashboard/page.tsx");
const fitnessStyle = read("../app/globals.css");
const dashboardStyle = read("../app/dashboard/dashboard.module.css");

test("saved Fitness plan shows dated current-week completion progress without model calls",()=>{
 assert.match(fitness,/const scheduledSessions = useMemo/);
 assert.match(fitness,/row\.isRestDay === true/);
 assert.match(fitness,/seen\.has\(key\)/);
 assert.match(fitness,/completedScheduleKeys\.has\(completionKey\(id,date\)\)/);
 assert.match(fitness,/This week's progress/);
 assert.match(fitness,/weekCompletedCount/);
 assert.match(fitness,/nextScheduledSession/);
 assert.match(fitness,/aria-label="Next scheduled workout"/);
 assert.match(fitness,/openWorkoutTracker\("current",nextScheduledSession\.row/);
 assert.match(fitness,/date >= todayKey/);
 assert.doesNotMatch(fitness,/fetch\("\/api\/fitness\/progress"/);
});

test("member dashboard offers direct Fitness resume links without new access or billing paths",()=>{
 assert.match(dashboard,/memberHasFitnessAccess\(email, user\.id\)/);
 assert.match(dashboard,/href="\/fitness\/chat\?view=workouts">Continue my workouts/);
 assert.match(dashboard,/href="\/fitness\/chat">Talk to Fitness Coach/);
 assert.match(dashboard,/lifeAvailable \? /);
 assert.match(dashboard,/Life Coach isn't available for this account right now/);
 assert.doesNotMatch(dashboard,/grantFitnessAccess\(|saveFitnessMembership\(|stripeRequest\(/);
 assert.match(dashboardStyle,/\.continueActions/);
 assert.match(fitnessStyle,/\.member-next-session/);
});
