import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function pageSource() {
  return readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
}

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("coach replies remove markdown emphasis markers before display", async () => {
  const text = await pageSource();

  assert.match(text, /function cleanCoachText\(value: string\)/);
  assert.match(text, /replace\(\/\\\*\\\*\/g, ""\)/);
  assert.match(text, /text: cleanCoachText\(data\.response!\)/);
});

test("saved-plan summaries are emitted without markdown bold wrappers", async () => {
  const text = await routeSource();

  assert.doesNotMatch(text, /\*\*\$\{label\}/);
  assert.doesNotMatch(text, /\*\*\$\{index \+ 1\}/);
  assert.match(text, /return `\$\{label\} \(\$\{formatDateKey\(range\.start\)\}/);
});
