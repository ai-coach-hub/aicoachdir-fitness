import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("fitness usage exhaustion shows a membership route but never starts checkout", async () => {
  const ui = await source("app/fitness/chat/page.tsx");
  assert.match(ui, /response\.status === 429/);
  assert.match(ui, /usageLimitReached/);
  assert.match(ui, /href="\/manage-subscription"/);
  assert.match(ui, /Review Membership Options/);
  assert.doesNotMatch(ui, /usageLimitReached\s*\?[^\n]*\/api\/billing\/create-checkout-session/);
});

test("life usage exhaustion shows membership route and preserves the existing request recovery", async () => {
  const ui = await source("app/life/LifeChat.tsx");
  assert.match(ui, /r\.status===429/);
  assert.match(ui, /usageLimitReached/);
  assert.match(ui, /href="\/manage-subscription"/);
  assert.match(ui, /Review Membership Options/);
  assert.match(ui, /Check Previous chats before sending again/);
});

test("billing failure is explained without creating a second paid account", async () => {
  const page = await source("app/manage-subscription/page.tsx");
  const portal = await source("app/api/billing/customer-portal/route.ts");
  assert.match(page, /billingError/);
  assert.match(page, /Secure billing management could not open/);
  assert.match(page, /You do not need to start another subscription/);
  assert.match(portal, /billing=unavailable/);
});

test("usage-limit messaging cannot be mistaken for a working paid upgrade", async () => {
  const fitness = await source("app/fitness/chat/page.tsx");
  const life = await source("app/life/LifeChat.tsx");
  assert.doesNotMatch(fitness, /Upgrade Now|Pay Now|Purchase More Messages/);
  assert.doesNotMatch(life, /Upgrade Now|Pay Now|Purchase More Messages/);
});
