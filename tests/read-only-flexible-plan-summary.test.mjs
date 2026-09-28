import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("read-only plan summaries include flexibleSequence plans", async () => {
  const text = await routeSource();

  assert.match(text, /function summarizeFlexibleSequence\(plan: Record<string, unknown>, label: string\)/);
  assert.match(text, /Array\.isArray\(plan\.flexibleSequence\)/);
  assert.match(text, /summarizeFlexibleSequence\(plan, "Current flexible sequence"\)/);
  assert.match(text, /summarizeFlexibleSequence\(candidate, "Next flexible sequence"\)/);
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
    /summarizeWeek\(plan, "Current saved week"\) \|\|\s*summarizeFlexibleSequence/,
  );
  assert.match(
    text,
    /summarizeWeek\(candidate, "Next saved week"\) \|\|\s*summary/,
  );
});
