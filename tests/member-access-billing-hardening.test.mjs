import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Fitness chat API independently requires active membership", async () => {
  const text = await source("app/api/fitness/chat/route.ts");
  assert.match(text, /memberHasFitnessAccess/);
  const occurrences = text.match(/An active Fitness Coach membership is required\./g) || [];
  assert.equal(occurrences.length, 2);
  assert.match(text, /status: 403/);
  assert.match(text, /membership verification is temporarily unavailable/);
});

test("checkout fails closed if current membership cannot be verified", async () => {
  const text = await source("app/api/billing/create-checkout-session/route.ts");
  assert.match(text, /could not verify your current AI Coach Directory membership/);
  assert.match(text, /status: 503/);
});

test("paid membership is persisted before Pickaxe provisioning on success", async () => {
  const text = await source("app/fitness/checkout/success/page.tsx");
  const save = text.indexOf("await saveFitnessMembership");
  const grant = text.indexOf("await grantFitnessAccess");
  assert.ok(save >= 0);
  assert.ok(grant >= 0);
  assert.ok(save < grant);
  assert.match(text, /pickaxe-provisioning-failed/);
});

test("webhook persists active Stripe membership before granting Pickaxe access", async () => {
  const text = await source("app/api/billing/webhook/route.ts");
  const activeBranch = text.slice(text.indexOf("if (args.active)"), text.indexOf("// For revocation"));
  assert.ok(activeBranch.indexOf("await saveFitnessMembership") >= 0);
  assert.ok(activeBranch.indexOf("await grantFitnessAccess") >= 0);
  assert.ok(activeBranch.indexOf("await saveFitnessMembership") < activeBranch.indexOf("await grantFitnessAccess"));
});
