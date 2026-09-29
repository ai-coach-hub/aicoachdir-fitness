import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = () => readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
const pageSource = () => readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");

test("validated delivery parser ignores inline marker-name instructions", async () => {
  const text = await routeSource();

  assert.match(text, /const markerBlock =/);
  assert.match(text, /content\.lastIndexOf\(startMarker\)/);
  assert.match(text, /\^\(\?:and\|to\)\$/);
  assert.doesNotMatch(text, /const start = content\.indexOf\(startMarker\);/);
});

test("validation-only delivery is not presented as a saved workout update", async () => {
  const text = await pageSource();

  assert.match(text, /actionMode\?: string \| null/);
  assert.match(text, /data\.actionMode === "validate_workout_feasibility"/);
  assert.match(text, /const savedPlanChanged =/);
  assert.match(text, /setStatus\(savedPlanChanged \? "Workout updated and validated\." : ""\)/);
  assert.match(text, /if \(savedPlanChanged\) \{/);
});
