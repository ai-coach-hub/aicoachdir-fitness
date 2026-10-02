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

test("only a verified saved plan is presented as a saved workout update", async () => {
  const text = await readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
  assert.match(text, /const savedPlanChanged = data\.savedPlanVerified === true;/);
  assert.doesNotMatch(text, /data\.relaySource === "action-final-delivery" && !validationOnly/);
  assert.match(text, /if \(savedPlanChanged && data\.plan\)/);
});
