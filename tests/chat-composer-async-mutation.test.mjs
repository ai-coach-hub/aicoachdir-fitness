import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function pageSource() {
  return readFile(new URL("../app/fitness/chat/page.tsx", import.meta.url), "utf8");
}

async function cssSource() {
  return readFile(new URL("../app/globals.css", import.meta.url), "utf8");
}

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("empty coach chat keeps the composer close to the rotating intro", async () => {
  const page = await pageSource();
  const css = await cssSource();

  assert.match(
    page,
    /messages\.length === 0 \? "member-chat-messages is-empty" : "member-chat-messages"/,
  );
  assert.match(css, /\.member-chat-messages\.is-empty \{/);
  assert.match(css, /\.member-chat-messages\.is-empty \{[\s\S]*?min-height: 0;/);
});

test("desktop Enter sends while Shift+Enter remains available for a newline", async () => {
  const text = await pageSource();

  assert.match(text, /event\.key === "Enter"/);
  assert.match(text, /!event\.shiftKey/);
  assert.match(text, /!event\.nativeEvent\.isComposing/);
  assert.match(text, /event\.preventDefault\(\)/);
  assert.match(text, /event\.currentTarget\.form\?\.requestSubmit\(\)/);
});

test("validated workout mutations use async Pickaxe triggers instead of synchronous completion", async () => {
  const text = await routeSource();

  const mutationStart = text.indexOf("if (mustUseValidatedDelivery) {");
  const nonMutationStart = text.indexOf("} else {", mutationStart);
  assert.ok(mutationStart >= 0 && nonMutationStart > mutationStart);

  const mutationBlock = text.slice(mutationStart, nonMutationStart);
  assert.ok(mutationBlock.includes("PICKAXE_STUDIO_BASE_URL}/triggers"));
  assert.match(mutationBlock, /stream: true/);
  assert.match(
    mutationBlock,
    /\[SAVE_WORKOUT_PLAN_ACTION_ID, GET_WORKOUT_PLAN_ACTION_ID\]/,
  );
  assert.match(mutationBlock, /AbortSignal\.timeout\(55_000\)/);
  assert.doesNotMatch(mutationBlock, /PICKAXE_COMPLETIONS_URL/);
});

test("non-mutation coaching retains the existing completion path", async () => {
  const text = await routeSource();

  assert.match(text, /PICKAXE_COMPLETIONS_URL/);
  assert.match(text, /stream: false/);
});
