import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function memberHubSource() {
  return readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
}

async function fitnessRouteSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("saved workouts can be expanded and collapsed from My Workouts", async () => {
  const text = await memberHubSource();

  assert.match(text, /expandedWorkoutKey/);
  assert.match(text, /aria-expanded=\{expandedWorkoutKey === key\}/);
  assert.match(text, /View details/);
  assert.match(text, /Hide details/);
});

test("current-week scheduled workouts can be marked complete from My Workouts", async () => {
  const text = await memberHubSource();

  assert.match(text, /completeScheduledWorkout/);
  assert.match(text, /complete_workout/);
  assert.match(text, /Mark complete/);
  assert.match(text, /Completed/);
});

test("fitness member route persists authenticated workout completions", async () => {
  const text = await fitnessRouteSource();

  assert.match(text, /action === "complete_workout"/);
  assert.match(text, /saveMemberWorkoutHistory/);
  assert.match(text, /scheduledDate/);
  assert.match(text, /completedAt/);
});


test("scheduled workouts open a full tracker for current and future days", async () => {
  const text = await memberHubSource();

  assert.match(text, /openWorkoutTracker/);
  assert.match(text, /Open workout/);
  assert.match(text, /activeWorkoutTracker/);
  assert.match(text, /workout-tracker-panel/);
  assert.match(text, /upcomingRows\.map/);
});

test("workout tracker renders editable set fields for reps weight time and distance", async () => {
  const text = await memberHubSource();

  assert.match(text, /Set \{setIndex \+ 1\}/);
  assert.match(text, /placeholder="Weight"/);
  assert.match(text, /placeholder="Reps"/);
  assert.match(text, /placeholder="Time"/);
  assert.match(text, /placeholder="Distance"/);
  assert.match(text, /Skip exercise/);
});

test("completing from the tracker sends entered exercise sets to the authenticated route", async () => {
  const text = await memberHubSource();

  assert.match(text, /exercises:\s*trackerExercises/);
  assert.match(text, /notes:\s*trackerNotes/);
  assert.match(text, /Complete workout/);
});

test("fitness member route sanitizes and persists submitted exercise tracking data", async () => {
  const text = await fitnessRouteSource();

  assert.match(text, /sanitizeTrackedExercises/);
  assert.match(text, /input\.exercises/);
  assert.match(text, /weight/);
  assert.match(text, /reps/);
  assert.match(text, /time/);
  assert.match(text, /distance/);
  assert.match(text, /notes/);
});


test("workout tracker only shows fields that match the exercise prescription", async () => {
  const text = await memberHubSource();

  assert.match(text, /trackerFieldVisibility/);
  assert.match(text, /fields:\s*trackerFieldVisibility\(exercise\)/);
  assert.match(text, /exercise\.fields\.weight/);
  assert.match(text, /exercise\.fields\.reps/);
  assert.match(text, /exercise\.fields\.time/);
  assert.match(text, /exercise\.fields\.distance/);
  assert.match(text, /distanceRelevant/);
  assert.match(text, /timeRelevant/);
  assert.match(text, /repsRelevant/);
});


test("past scheduled workouts can recover a missing coach-history sync without duplicating completions", async () => {
  const page = await memberHubSource();
  const route = await fitnessRouteSource();

  assert.match(page, /Sync with Coach/);
  assert.match(page, /sync_completed_workout/);
  assert.match(route, /action === "sync_completed_workout"/);
  assert.match(route, /existingCompletion/);
  assert.match(route, /alreadySynced:\s*true/);
});

test("future workouts cannot be marked complete from the schedule or tracker", async () => {
  const page = await memberHubSource();
  const route = await fitnessRouteSource();

  assert.match(page, /scheduledDate < todayKey/);
  assert.match(page, /Scheduled for later/);
  assert.match(route, /scheduledDate > today/);
  assert.match(route, /Future workouts cannot be marked complete/);
});


test("natural next-week workout requests are treated as saved plan mutations", async () => {
  const route = await fitnessRouteSource();

  assert.match(route, /give\|make\|build\|create\|plan\|schedule/);
  assert.match(route, /next week\|this week/);
  assert.match(route, /treat it as a plan to save in My Workouts/);
  assert.match(route, /Preserve the current saved week/);
});

test("unknown hotel gym equipment can use a conservative baseline when the member authorizes a best guess", async () => {
  const route = await fitnessRouteSource();

  assert.match(route, /conservative common baseline/);
  assert.match(route, /basic hotel gym/);
  assert.match(route, /complete\/save the plan instead of blocking on another equipment question/);
});


test("previous chats hide internal coaching instruction wrappers from members", async () => {
  const historyRoute = await readFile(
    new URL("../app/api/fitness/chat/history/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(historyRoute, /memberFacingHistoryText/);
  assert.match(historyRoute, /MEMBER MESSAGE:/);
  assert.match(historyRoute, /ORIGINAL MEMBER MESSAGE:/);
  assert.match(historyRoute, /parsed\.push\(\{ role, text: memberFacingHistoryText\(role, text\) \}\)/);
});


test("member workout and chat-history reads retry a transient authenticated-session 401", async () => {
  const text = await memberHubSource();

  assert.match(text, /withTransientAuthRetry/);
  assert.match(
    text,
    /withTransientAuthRetry\(\(\) =>\s*fetch\("\/api\/fitness\/chat",\s*\{ method: "GET", cache: "no-store" \}\)\)/,
  );
  assert.match(
    text,
    /withTransientAuthRetry\(\(\) =>\s*fetch\("\/api\/fitness\/chat\/history",\s*\{[\s\S]*?method: "GET",[\s\S]*?cache: "no-store",[\s\S]*?\}\)\)/,
  );
});
