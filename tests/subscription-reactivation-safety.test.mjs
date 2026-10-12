import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("checkout blocks duplicate active or recoverable subscriptions for all matching Stripe customers", async () => {
  const helper = await source("lib/stripeMembershipState.ts");
  const checkout = await source("app/api/billing/create-checkout-session/route.ts");
  assert.match(helper, /\/customers\?/);
  assert.match(helper, /\/subscriptions\?/);
  assert.match(helper, /listed\.has_more === true/);
  assert.match(helper, /kind: "active"/);
  assert.match(helper, /kind: "recoverable"/);
  assert.match(checkout, /checkCheckoutRisk\(email, storedCustomerId\)/);
  assert.match(checkout, /risk\.kind === "active"/);
  assert.match(checkout, /risk\.kind === "recoverable"/);
  assert.match(checkout, /will not charge you twice/);
  assert.ok(checkout.indexOf("checkCheckoutRisk(email") < checkout.indexOf('stripeRequest("/checkout/sessions"'));
});

test("Checkout creates one reserved Stripe session with an idempotency key and stable terms ID", async () => {
  const checkout = await source("app/api/billing/create-checkout-session/route.ts");
  const db = await source("lib/stripeCheckoutReservations.ts");
  assert.match(checkout, /reserveCheckout\(/);
  assert.match(checkout, /reservation\.termsAcceptanceId/);
  assert.match(checkout, /reservation\.sessionId/);
  assert.match(checkout, /idempotencyKey:.*reservation\.attemptId/);
  assert.match(checkout, /rememberCheckoutSession\(/);
  assert.match(db, /PRIMARY KEY/);
  assert.match(db, /ON CONFLICT \(email\)/);
  assert.match(db, /reservation_expires_at <= NOW\(\)/);
  assert.match(db, /stripe_session_id IS NULL OR stripe_session_id =/);
});

test("checkout never uses an unverified Clerk identity to access a billing customer", async () => {
  const checkout = await source("app/api/billing/create-checkout-session/route.ts");
  assert.match(checkout, /primaryEmail\?\.verification\?\.status !== "verified"/);
  assert.match(checkout, /savedSubscriptionId === risk\.subscriptionId/);
  assert.match(checkout, /String\(existing\?\.clerk_user_id \|\| ""\) === user\.id/);
  assert.match(checkout, /stripeSubscriptionIsActive\(current\.status\)/);
  assert.doesNotMatch(checkout, /searchParams\.get\(["']customer/);
});

test("member statuses are refreshed and linked inactive paid members cannot regain access from stale Pickaxe grants", async () => {
  const member = await source("lib/fitnessMembershipDb.ts");
  assert.match(member, /refreshLinkedMembershipStatus\(/);
  assert.match(member, /getVerifiedSubscription\(/);
  assert.match(member, /last_stripe_verified_at/);
  assert.match(member, /revokeFitnessAccess\(/);
  assert.match(member, /existing\?\.stripe_customer_id \|\| existing\?\.stripe_subscription_id/);
  assert.match(member, /return false/);
  assert.match(member, /stripe_status = 'legacy_pickaxe_member'/);
});

test("historical Pickaxe reconciliation verifies identity and preserves unmatched grandfathered users", async () => {
  const legacy = await source("lib/legacyBillingVerification.ts");
  const member = await source("lib/fitnessMembershipDb.ts");
  assert.match(legacy, /metadata\.studioUserId/);
  assert.match(legacy, /metadata\.studioId/);
  assert.match(legacy, /products\.includes\(FITNESS_ACCESS_GROUP_ID\)/);
  assert.match(legacy, /billingEmail\(customer\.email\) !== memberEmail/);
  assert.match(legacy, /outstanding\.length > 1/);
  assert.match(member, /last_legacy_verified_at/);
  assert.match(member, /if \(!verified\)/);
  assert.match(member, /return getFitnessMembership\(email\)/);
  assert.match(member, /eventType: "legacy_sync"/);
});

test("scheduled cancellation can be resumed only by the linked member without a second payment", async () => {
  const route = await source("app/api/billing/resume-renewal/route.ts");
  assert.match(route, /request\.headers\.get\("origin"\) !== origin/);
  assert.match(route, /verification\?\.status !== "verified"/);
  assert.match(route, /String\(saved\.clerk_user_id \|\| ""\) !== user\.id/);
  assert.match(route, /live\.state !== "canceling"/);
  assert.match(route, /cancel_at_period_end/);
  assert.match(route, /"false"/);
  assert.match(route, /verified\.state !== "active"/);
  assert.doesNotMatch(route, /\/checkout\/sessions/);
  assert.doesNotMatch(route, /\/subscriptions[^\n]*\/cancel/);
});

test("a canceled member reuses their account, and a recoverable payment leads to billing instead of checkout", async () => {
  const page = await source("app/manage-subscription/page.tsx");
  const client = await source("components/FitnessMemberLoginClient.tsx");
  const subscribe = await source("app/fitness/subscribe/page.tsx");
  const terms = await source("lib/currentMembershipTerms.ts");
  assert.match(page, /billingState === "recoverable"/);
  assert.match(page, /billingState === "canceled"/);
  assert.match(page, /\/api\/billing\/resume-renewal/);
  assert.match(page, /\/api\/billing\/customer-portal/);
  assert.match(page, /\/fitness\/subscribe\?destination=fitness/);
  assert.match(client, /\/fitness\/subscribe\?destination=budget-coach/);
  assert.match(subscribe, /currentMembershipTermsId\(email\)/);
  assert.match(terms, /terms_version =/);
  assert.match(terms, /included_uses =/);
});

test("rejoining never erases historical coaching records or recreates the login", async () => {
  const checkout = await source("app/api/billing/create-checkout-session/route.ts");
  const termsGate = await source("components/TermsGate.tsx");
  assert.match(checkout, /client_reference_id/);
  assert.match(termsGate, /isSignedIn/);
  assert.match(termsGate, /\/fitness\/subscribe/);
  assert.doesNotMatch(checkout, /DELETE FROM|TRUNCATE/);
  assert.doesNotMatch(termsGate, /deleteUser|revokeUser/);
});
