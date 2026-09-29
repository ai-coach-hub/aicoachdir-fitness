import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function pageSource() {
  return readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
}

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("member chat restores the approved eight rotating intros without quick-start buttons", async () => {
  const text = await pageSource();

  for (const prompt of [
    "What are we working on today?",
    "Ready to train? Tell me what you want to accomplish.",
    "What kind of workout are you looking for today?",
    "Tell me what you need today. I’ll take it from there.",
    "What would make today’s workout a win?",
    "Where are you starting from, and where do you want to go?",
    "Gym, home, outdoors, or somewhere else—what are we working with today?",
    "Let’s build something that fits you. What are you looking to accomplish?",
  ]) {
    assert.ok(text.includes(prompt), `missing approved intro: ${prompt}`);
  }

  assert.match(text, /prompt !== previous/);
  assert.match(text, /messages\.length === 0 && !input\.trim\(\)/);
  assert.doesNotMatch(text, /What should I do today\?/);
  assert.doesNotMatch(text, /I need to adjust this week\./);
});

test("validated workout requests watch both save and get Action runs", async () => {
  const text = await routeSource();

  assert.match(
    text,
    /const mustUseValidatedDelivery = requiresValidatedWorkoutDelivery\(message\)/,
  );
  assert.match(
    text,
    /if \(mustUseValidatedDelivery\)[\s\S]*?\[SAVE_WORKOUT_PLAN_ACTION_ID, GET_WORKOUT_PLAN_ACTION_ID\]/,
  );
  assert.match(text, /fetchActionRunsForSession\(sessionId, studioToken, actionIds, signal\)/);
  assert.match(text, /url\.searchParams\.set\("actionId", actionId\)/);
  assert.match(text, /Promise\.allSettled/);
});
