import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("read-only plan summaries include flexibleSequence plans", async () => {
  const text = await routeSource();

  assert.match(text, /function summarizeFlexibleSequencesummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence(plan: Record<string, unknown>, label: stringsummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence)/);
  assert.match(text, /ArraysummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence.isArraysummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence(plansummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence.flexibleSequencesummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence)/);
  assert.match(text, /summarizeFlexibleSequencesummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequencesummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence(visiblePlan, "Current flexible sequence"summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequencesummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence)/);
  assert.match(text, /summarizeFlexibleSequencesummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence(candidate, "Next flexible sequence"summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence)/);
});

test("nextPlan summary supports nested and direct plan shapes", async () => {
  const text = await routeSource();

  assert.match(text, /const wrapper = nextPlanContainer as Record<string, unknown>;/);
  assert.match(text, /const candidate =/);
  assert.match(text, /: wrapper;/);
});

test("fixed weekday summaries remain preferred when available", async () => {
  const text = await routeSource();

  assert.match(
    text,
    /summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence|summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence|summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequences*summarizeFlexibleSequence/,
  );
  assert.match(
    text,
    /summarizeWeeksummarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence(candidate, "Next saved week"summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence) summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence|summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequence|summarizeWeek\\(visiblePlan, "Current saved week"\\) \\|\\|\\s*summarizeFlexibleSequences*summarizeFlexibleSequence/,
  );
});
