import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const adapter = fs.readFileSync("lib/previewFitnessChat.ts", "utf8");
const route = fs.readFileSync("app/api/fitness/chat/route.ts", "utf8");
const client = fs.readFileSync("app/fitness/chat/page.tsx", "utf8");

test("Fitness shared meter is isolated to preview, exact sandbox branch and explicit opt-in", () => {
  assert.match(adapter, /VERCEL_ENV !== "preview"/);
  assert.match(adapter, /VERCEL_GIT_COMMIT_REF !== "feature\/life-coach-agent-sandbox-20261011"/);
  assert.match(adapter, /PREVIEW_SHARED_USAGE_METER_ENABLED !== "true"/);
  assert.match(adapter, /lifeTester\(\)/);
  assert.match(adapter, /lifeTestStatus\(member\)/);
  assert.match(adapter, /if \(!enrollment\.active\) return Response\.json/);
});
test("Workout completion is not charged and Fitness entitlement checked before reservation", () => {
  assert.match(adapter, /body\.action === "complete_workout"/);
  assert.match(adapter, /body\.action === "sync_completed_workout"/);
  assert.ok(adapter.indexOf("memberHasFitnessAccess(") < adapter.indexOf("runMeteredPreviewGeneration("));
});
test("Fitness chat uses shared Life test allowance and reserves before provider invocation", () => {
  assert.match(adapter, /previewLifeTestSubscription/);
  assert.match(adapter, /previewLifeTestPeriod/);
  assert.match(adapter, /coach: "fitness" as const/);
  assert.match(adapter, /reservePreviewAiUse\(usage\)/);
  assert.match(adapter, /settlePreviewAiUse\(usage, outcome\)/);
  assert.match(adapter, /body\.message\.trim\(\) !== "TEST SHARED COUNTER"/);
  assert.match(adapter, /previewSimulation: true/);
  assert.ok(adapter.indexOf('body.message.trim() !== "TEST SHARED COUNTER"') < adapter.indexOf("runMeteredPreviewGeneration("));
  assert.match(adapter, /result\.reason === "exhausted"/);
});
test("Fitness provides a request key from the browser and retains old handler", () => {
  assert.ok(client.includes('? previous.requestKey : `fitness-${crypto.randomUUID()}`'));
  assert.ok(client.includes('pendingChatRequest.current={message,conversationId,requestKey}'));
  assert.match(route, /previewFitnessChat\(request, postFitnessWithoutPreviewMeter\)/);
  assert.match(route, /async function postFitnessWithoutPreviewMeter\(request: Request\)/);
});
