import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = (path) => readFileSync(new URL(path,import.meta.url),"utf8");
const fitness = read("../app/fitness/chat/page.tsx");
const dashboard = read("../app/dashboard/page.tsx");
const fitnessStyle = read("../app/globals.css");
const dashboardStyle = read("../app/dashboard/dashboard.module.css");
const lifePage = read("../app/life/page.tsx");

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

test("member quick access includes saved budget, both coaching paths, and only eligible Life access",()=>{
 assert.match(dashboard,/aria-label="Quick access to your coaching"/);
 assert.match(dashboard,/href="\/budgeting\/launch\?destination=tracker">My Budget/);
 assert.match(dashboard,/href="\/budgeting\/launch\?destination=coach">Budgeting Coach/);
 assert.match(dashboard,/lifeAvailable \? <Link href="\/life">Life Coach<\/Link> : null/);
 assert.match(dashboard,/href="\/manage-subscription"/);
 assert.doesNotMatch(dashboard,/href="\/life\?goals=1"/);
 assert.doesNotMatch(dashboard,/grantFitnessAccess\(|saveFitnessMembership\(/);
});
test("Fitness and production Life coach pages link through existing authorized coach routes",()=>{
 for(const url of ["/budgeting/launch?destination=coach","/budgeting/launch?destination=tracker"]){
  assert.ok(fitness.includes(url),"Fitness cross-coach navigation missing "+url);
  assert.ok(lifePage.includes(url),"Life cross-coach navigation missing "+url);
 }
 assert.match(fitness,/href="\/dashboard" className="secondary-button">Dashboard/);
 assert.match(lifePage,/aria-label="Member coach navigation"/);
 assert.match(lifePage,/process\.env\.VERCEL_ENV==="production" \? <>/);
 assert.match(lifePage,/href="\/fitness\/chat"/);
 assert.doesNotMatch(lifePage,/saveFitnessMembership\(|grantFitnessAccess\(/);
});
test("Fitness scheduled-date guard accepts ISO day keys and rejects invalid dates",()=>{
 const guard = fitness.match(/!\s*(\/\^[^\n]+?\$\/)\.test\(date\)/);
 assert.ok(guard, "expected scheduled-date validation in the Fitness page");
 const datePattern = new RegExp(guard[1].slice(1,-1));
 assert.equal(datePattern.test("2026-11-10"),true);
 assert.equal(datePattern.test("2026-01-05"),true);
 assert.equal(datePattern.test("2026/11/10"),false);
 assert.equal(datePattern.test("2026-1-10"),false);
 assert.equal(datePattern.test("not-a-date"),false);
});
