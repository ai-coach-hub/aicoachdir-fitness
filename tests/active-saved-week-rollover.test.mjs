import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("saved-plan reads promote an active nested nextPlan after the parent week expires", async () => {
  const text = await routeSource();

  assert.match(text, /function activeSavedPlan\(plan: Record<string, unknown>\)/);
  assert.match(text, /currentRange\.end < today && nextRange\.start <= today/);
  assert.match(text, /plan: data\.plan \? activeSavedPlan\(data\.plan\) : null/);
});

test("read-only chat summaries use the promoted active plan", async () => {
  const text = await routeSource();

  assert.match(
    text,
    /function summarizeSavedPlan\(plan: Record<string, unknown>\) \{\s*plan = activeSavedPlan\(plan\);/,
  );
});

test("nested nextPlan parsing is shared instead of duplicated", async () => {
  const text = await routeSource();

  assert.match(text, /function nextPlanCandidate\(plan: Record<string, unknown>\)/);
  assert.match(text, /const candidate = nextPlanCandidate\(plan\);/);
});
