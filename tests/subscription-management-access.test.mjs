import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("subscription management is reachable discreetly from public footer and signed-in coach", async () => {
  const home = await source("app/page.tsx");
  const coach = await source("app/fitness/chat/page.tsx");
  assert.match(home, /href="\/manage-subscription"/);
  assert.match(coach, /href="\/manage-subscription"/);
});
test("billing portal is only created for the authenticated member's saved Stripe customer", async () => {
  const portal = await source("app/api/billing/customer-portal/route.ts");
  assert.match(portal, /currentUser\(/);
  assert.match(portal, /resolveMemberBillingCustomer\(email, user\.id\)/);
  assert.match(portal, /billing\.outcome !== "linked"/);
  assert.match(portal, /form\.set\("customer", billing\.customerId\)/);
  assert.match(portal, /\/billing_portal\/sessions/);
  assert.doesNotMatch(portal, /searchParams\.get\(["']customer/);
});
test("billing management has a legacy/support fallback", async () => {
  const page = await source("app/manage-subscription/page.tsx");
  assert.match(page, /Ai\.coach\.hub\.domain@gmail\.com/i);
  assert.match(page, /customer-portal/);
});
