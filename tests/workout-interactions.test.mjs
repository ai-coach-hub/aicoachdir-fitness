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
  assert.match(text, /action:\s*"complete_workout"/);
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
