import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function memberHubSource() {
  return readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
}

test("current and next week workouts keep separate scoped keys", async () => {
  const text = await memberHubSource();

  assert.match(text, /type WorkoutScope = "current" \| "next"/);
  assert.match(text, /key: `\$\{scope\}:\$\{id\}`/);
  assert.match(text, /scopedWorkoutEntries\(currentWorkouts, "current"\)/);
  assert.match(text, /scopedWorkoutEntries\(upcomingWorkouts, "next"\)/);
  assert.doesNotMatch(text, /\.\.\.upcomingWorkouts, \.\.\.currentWorkouts/);
});

test("schedule cards never borrow workout details from the other week", async () => {
  const text = await memberHubSource();

  assert.match(text, /const workout = asRecord\(currentWorkouts\[id\]\);/);
  assert.match(text, /const workout = asRecord\(upcomingWorkouts\[id\]\);/);
  assert.doesNotMatch(text, /asRecord\(workouts\[id\]\)/);
});

test("adjust with coach identifies the intended saved week", async () => {
  const text = await memberHubSource();

  assert.match(text, /scope === "next" \? "Next saved week" : "Current saved week"/);
  assert.match(
    text,
    /workout in my \$\{scope === "next" \? "next" : "current"\} saved week\./,
  );
});
