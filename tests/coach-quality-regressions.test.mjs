import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function routeSource() {
  return readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
}

test("ordinary coaching gets a compact relevance and actionability directive", async () => {
  const text = await routeSource();

  assert.match(text, /function buildCoachQualityMessage\(message: string\)/);
  assert.match(text, /Use the active subject from recent context and answer the member directly\./);
  assert.match(text, /give a concrete next step now instead of generic talking points or an arbitrary check-back delay\./);
  assert.match(text, /Do not broaden scope or re-ask known information\./);
  assert.match(text, /Be concise, specific, and actionable\./);
});

test("quality guard does not replace structured workout or saved-plan integrity flows", async () => {
  const text = await routeSource();

  assert.match(
    text,
    /return !requiresValidatedWorkoutDelivery\(message\) && !isSavedPlanReadQuery\(message\);/,
  );
  assert.match(text, /message: pickaxeMessage/);
  assert.match(text, /const mustUseValidatedDelivery = requiresValidatedWorkoutDelivery\(message\);/);
  assert.match(text, /action-session-fail-closed/);
});

test("arbitrary multi-week deferrals trigger one bounded quality rewrite", async () => {
  const text = await routeSource();

  assert.match(text, /signals\.push\("ARBITRARY_DEFERRAL"\)/);
  assert.match(text, /signals\.push\("LOW_ACTIONABILITY"\)/);
  assert.match(text, /async function requestCoachQualityRewrite/);
  assert.match(text, /AbortSignal\.timeout\(45_000\)/);
  assert.match(text, /relaySource = "assistant-response-quality-rewrite"/);
});

test("restriction safety validation still runs after any quality rewrite", async () => {
  const text = await routeSource();

  const rewrite = text.indexOf('relaySource = "assistant-response-quality-rewrite"');
  const movementCheck = text.indexOf("validateMovementAllowlist(message, finalResponseText)");
  const targetCheck = text.indexOf("validateInventedJointTargets(message, finalResponseText)");

  assert.ok(rewrite >= 0);
  assert.ok(movementCheck > rewrite);
  assert.ok(targetCheck > rewrite);
});

test("quality guard remains internal and is not exposed in the member API payload", async () => {
  const text = await routeSource();
  const responseStart = text.lastIndexOf("return Response.json({");
  const responseTail = text.slice(responseStart);

  assert.doesNotMatch(responseTail, /qualityGuardApplied,/);
  assert.doesNotMatch(responseTail, /qualityRewriteApplied,/);
  assert.doesNotMatch(responseTail, /qualitySignals,/);
});


test("structured workout turns get first-pass validator efficiency guidance", async () => {
  const text = await routeSource();

  assert.match(text, /function buildStructuredWorkoutEfficiencyMessage\(message: string\)/);
  assert.match(text, /build one complete candidate using only confirmed equipment\/setup/);
  assert.match(text, /fill it with real programmed work\/rest instead of padded headings/);
  assert.match(text, /do not run another feasibility attempt/);
  assert.match(text, /return buildStructuredWorkoutEfficiencyMessage\(message\);/);
});

test("saved-plan reads remain unwrapped and ordinary coaching keeps the relevance guard", async () => {
  const text = await routeSource();

  assert.match(text, /function buildPickaxeMessage\(message: string\)/);
  assert.match(text, /if \(requiresValidatedWorkoutDelivery\(message\)\)/);
  assert.match(text, /return buildCoachQualityMessage\(message\);/);
  assert.match(text, /if \(!shouldApplyCoachQualityGuard\(message\)\) return message;/);
});
