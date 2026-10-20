import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Fitness preview skips all live Pickaxe workout reads", () => {
  const code=fs.readFileSync("app/api/fitness/chat/route.ts","utf8");
  const get=code.slice(code.indexOf("export async function GET()"),code.indexOf("type DriverResult"));
  assert.match(get,/VERCEL_ENV === "preview"/);
  assert.match(get,/VERCEL_GIT_COMMIT_REF === "feature\/life-coach-agent-sandbox-20261011"/);
  assert.match(get,/previewWorkoutDataUnavailable: true/);
  assert.ok(get.indexOf("previewWorkoutDataUnavailable: true")<get.indexOf("getStudioToken()"));
});

test("Fitness preview skips live Pickaxe history retrieval", () => {
  const code=fs.readFileSync("app/api/fitness/chat/history/route.ts","utf8");
  const get=code.slice(code.indexOf("export async function GET()"));
  assert.match(get,/previewHistoryUnavailable: true/);
  assert.match(get,/VERCEL_GIT_COMMIT_REF === "feature\/life-coach-agent-sandbox-20261011"/);
  assert.ok(get.indexOf("previewHistoryUnavailable: true")<get.indexOf("getStudioToken()"));
});

test("Fitness preview shows server-side shared allowance", () => {
  const code=fs.readFileSync("app/fitness/chat/page.tsx","utf8");
  assert.match(code,/fetch\("\/api\/life\/usage-test"/);
  assert.match(code,/Private shared AI uses left:/);
  assert.match(code,/live chat history and saved workouts are intentionally not loaded/);
});
