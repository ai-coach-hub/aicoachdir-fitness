import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("an uncertain workout save never claims no update occurred", () => {
  const api = source("app/api/fitness/chat/route.ts");
  assert.match(api, /The save confirmation timed out\. Your workout plan may still have been saved/);
  assert.doesNotMatch(api, /The Coach did not return a verified save for this request\. No update was confirmed/);
  assert.match(api, /relaySource: "action-session-timeout"/);
  assert.match(api, /savedPlanVerified: false/);
});

test("the client performs a read-only refresh without replaying a timed-out mutation", () => {
  const client = source("app/fitness/chat/page.tsx");
  const branch = client.match(/if \(response\.status === 504 && data\.relaySource === "action-session-timeout"\) \{([\s\S]*?)\n        \}/)?.[1];
  assert.ok(branch, "the special uncertain timeout branch must exist");
  assert.match(branch, /pendingChatRequest\.current = null/);
  assert.match(branch, /setPendingPlanRequest\(" "\.trim\(\)\)|setPendingPlanRequest\(" "\)|setPendingPlanRequest\(""\)/);
  assert.match(branch, /setInput\(""\)/);
  assert.match(branch, /loadPlan\(true\)/);
  assert.doesNotMatch(branch, /fetch\(|method: "POST"|send\(/);
});
