import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("standalone workout requests and previous chats stay supported", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
  const history = await readFile(new URL("../app/api/fitness/chat/history/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("requiresConfirmedSavedPlanMutation"));
  assert.ok(route.includes("explicitlyDeclinesWorkoutSave"));
  assert.ok(route.includes("if (mustConfirmSavedPlanMutation)"));
  assert.ok(page.includes("Previous Chats"));
  assert.ok(page.includes("chat-history-rail"));
  assert.ok(page.includes("chat-history-list"));
  assert.ok(page.includes("openThreadFromRail"));
  assert.ok(page.includes("/api/fitness/chat/history"));
  assert.ok(page.includes("void loadChatHistory()"));
  assert.ok(history.includes("/studio/workspace/history"));
  assert.ok(history.includes('format: "messages"'));
});


test("coach display strips leaked markdown heading markers", async () => {
  const page = await readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes('replace(/\\\\(?=#{1,6}\\s)/g, "")'));
  assert.ok(page.includes('replace(/^#{1,6}\\s+/gm, "")'));
});


test("preview-only workouts use the lean no-action path", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("function isStandaloneNoSaveWorkout"));
  assert.ok(route.includes("function buildStandaloneWorkoutPreviewMessage"));
  assert.ok(route.includes("Do not call Get Workout Plan"));
  assert.ok(route.includes("Save Workout Plan, validate_workout_feasibility"));
  assert.ok(route.includes("planLookupSkipped: true"));
  assert.ok(route.includes("actionPollingSkipped: true"));
  assert.ok(route.includes("!standaloneNoSaveWorkout"));
});

test("workout history stays progression-only instead of duplicating the plan", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
  const historyRoute = await readFile(
    new URL("../app/api/pickaxe/workout-history/route.ts", import.meta.url),
    "utf8",
  );

  assert.equal(route.includes("mirrorPlanIntoHistoryMemory"), false);
  assert.equal(historyRoute.includes("plan: JsonRecord;"), false);
  assert.ok(historyRoute.includes('!("plan" in record)'));
});

test("production deploy compacts the Pickaxe system prompt with rollback backup", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/manual-production-deploy.yml", import.meta.url),
    "utf8",
  );
  const syncScript = await readFile(
    new URL("../scripts/sync-pickaxe-compact-coach.mjs", import.meta.url),
    "utf8",
  );

  assert.ok(workflow.includes("Sync compact Pickaxe coach configuration"));
  assert.ok(workflow.includes("--env-file=.vercel/.env.production.local"));
  assert.ok(syncScript.includes("AI FITNESS COACH - COMPACT PRODUCTION PROMPT v1"));
  assert.ok(syncScript.includes('body: JSON.stringify({ data: { role: compactPrompt } })'));
  assert.ok(syncScript.includes("ai-fitness-coach-role-before-compact.txt"));
});
