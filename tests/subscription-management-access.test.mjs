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
  assert.match(portal, /getFitnessMembership\(/);
  assert.match(portal, /stripe_customer_id/);
  assert.match(portal, /\/billing_portal\/sessions/);
  assert.doesNotMatch(portal, /searchParams\.get\(["']customer/);
});
test("billing management has a legacy/support fallback", async () => {
  const page = await source("app/manage-subscription/page.tsx");
  assert.match(page, /Ai\.coach\.hub\.domain@gmail\.com/i);
  assert.match(page, /customer-portal/);
});

test("customers without a Clerk account can see cancellation assistance", async () => {
  const manage = await source("app/manage-subscription/page.tsx");
  const signIn = await source("app/sign-in/[[...sign-in]]/page.tsx");
  assert.match(manage, /Can't sign in or account not found/);
  assert.match(manage, /request cancellation/);
  assert.match(manage, /without requiring a new account/);
  const login = await source("components/FitnessMemberLoginClient.tsx");
  const cancel = await source("app/api/billing/cancel-renewal/route.ts");
  assert.match(signIn, /manage or cancel your subscription without signing in/);
  assert.match(signIn, /href="\/manage-subscription"/);
  assert.match(login, /Manage or Cancel Subscription/);
  assert.doesNotMatch(manage, /Manage Billing by Email|getPublicStripePortalLoginUrl/);
  assert.match(manage, /\/api\/billing\/cancel-renewal/);
  assert.match(cancel, /currentUser\(/);
  assert.match(cancel, /verification\?\.status !== "verified"/);
  assert.match(cancel, /String\(saved\.clerk_user_id \|\| ""\) !== user\.id/);
  assert.match(cancel, /getVerifiedSubscription\(/);
  assert.match(cancel, /cancel_at_period_end/);
  assert.match(cancel, /"true"/);
  assert.match(cancel, /verified\.cancelAtPeriodEnd/);
  assert.doesNotMatch(cancel, /\/subscriptions[^\n]*\/cancel/);
});
