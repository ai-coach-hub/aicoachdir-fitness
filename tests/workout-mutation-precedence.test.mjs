import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("workout mutation intent takes precedence over read-only wording", async () => {
  const text = await routeSource();

  assert.match(text, /function hasWorkoutMutationIntent\(message: string\)/);
  assert.match(text, /if \(hasWorkoutMutationIntent\(message\)\) return false;/);
  assert.match(text, /if \(hasWorkoutMutationIntent\(message\)\) return true;/);
});

test("common move and shift wording is treated as schedule mutation intent", async () => {
  const text = await routeSource();

  assert.match(text, /reschedule\|schedule\|move\|shift\|add/);
  assert.match(text, /monday\|tuesday\|wednesday\|thursday\|friday\|saturday\|sunday/);
});

test("read-only saved-plan queries still bypass validated mutation delivery", async () => {
  const text = await routeSource();

  assert.match(text, /const explicitReadOnly =/);
  assert.match(text, /if \(explicitReadOnly\) return false;/);
  assert.match(text, /function isSavedPlanReadQuery\(message: string\)/);
});
