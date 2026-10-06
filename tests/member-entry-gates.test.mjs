import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("both live coach start buttons use the same membership signup flow", async () => {
  const page = await source("app/page.tsx");
  assert.match(
    page,
    /href="\/fitness\/signup" className="primary-button">Start Fitness Coach/,
  );
  assert.match(
    page,
    /href="\/fitness\/signup" className="primary-button">Start Budgeting Coach/,
  );
  assert.match(page, /destination=fitness/);
  assert.match(page, /destination=budget-coach/);
});

test("budget coach, tracker, and proxied APIs require a Clerk login", async () => {
  const proxy = await source("proxy.ts");
  assert.match(proxy, /pathname\.startsWith\("\/budget\/"\)/);
  assert.match(proxy, /const \{ userId \} = await auth\(\)/);
  assert.match(proxy, /pathname\.startsWith\("\/budget\/api\/"\)/);
  assert.match(proxy, /Member login is required/);
  assert.match(proxy, /\/fitness\/login/);
});

test("fitness coach and My Workouts remain protected by active membership", async () => {
  const layout = await source("app/fitness/chat/layout.tsx");
  assert.match(layout, /currentUser/);
  assert.match(layout, /memberHasFitnessAccess/);
  assert.match(layout, /redirect\("\/fitness\/login"\)/);
  assert.match(layout, /redirect\("\/fitness\/subscribe"\)/);
});
