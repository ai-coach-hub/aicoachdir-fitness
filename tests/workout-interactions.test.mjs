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
