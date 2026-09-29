import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("calendar read view promotes an expired saved week into its active nextPlan", async () => {
  const text = await routeSource();

  assert.match(text, /function projectPlanForCalendarView\(plan: Record<string, unknown>\)/);
  assert.match(text, /currentRange\.end < today/);
  assert.match(text, /next\.effectiveFrom <= today/);
  assert.match(text, /current = next\.plan/);
});

test("read-only chat summaries use the calendar-projected plan", async () => {
  const text = await routeSource();

  assert.match(text, /const visiblePlan = projectPlanForCalendarView\(plan\)/);
  assert.match(text, /summarizeWeek\(visiblePlan, "Current saved week"\)/);
  assert.match(text, /const nextPlanContainer = visiblePlan\.nextPlan/);
});

test("My Workouts GET returns the same calendar-projected plan without rewriting storage", async () => {
  const text = await routeSource();

  assert.match(text, /plan: data\.plan \? projectPlanForCalendarView\(data\.plan\) : null/);
  assert.doesNotMatch(text, /writePlanMemory\([^\n]+projectPlanForCalendarView/);
});
