import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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


test("compact Pickaxe migration script parses as valid Node code", () => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/sync-pickaxe-compact-coach.mjs", import.meta.url),
  );
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });
});

test("standalone previews reject unconfirmed resistance-band anchor setup", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("memberDisallowsAnchorSetup"));
  assert.ok(route.includes("responseUsesUnconfirmedAnchor"));
  assert.ok(route.includes("UNCONFIRMED_ANCHOR_SETUP"));
  assert.ok(route.includes("treat the resistance band as UNANCHORED"));
  assert.ok(route.includes("do not use anchored band rows, pulldowns, presses"));
});

test("standalone previews catch invalid unanchored band setup", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
  assert.ok(route.includes("responseUsesInvalidUnanchoredBandSetup"));
  assert.ok(route.includes("INVALID_UNANCHORED_BAND_SETUP"));
});


test("standalone previews guard mechanically invalid row setup and unilateral timing", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("INVALID_UPRIGHT_DUMBBELL_ROW"));
  assert.ok(route.includes("responseUsesInvalidUprightDumbbellRow"));
  assert.ok(route.includes("Count both sides of unilateral work in the duration check"));
});


test("short standalone previews use time-anchored programming when needed", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("For short sessions (about 30 minutes or less)"));
  assert.ok(route.includes("prefer time-anchored blocks, EMOMs, AMRAPs, intervals"));
  assert.ok(route.includes("convert the main work to timed rounds"));
});


test("saved-plan mutations log per-action breakdown without another model call", async () => {
  const route = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");

  assert.ok(route.includes("logSavedMutationActionBreakdown"));
  assert.ok(route.includes("mutation-action-breakdown"));
  assert.ok(route.includes("sourceActionId"));
  assert.ok(route.includes("save_workout_plan"));
  assert.ok(route.includes("get_workout_plan"));
});
