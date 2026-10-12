import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy subscription match requires a Pickaxe Studio user ID and the exact legacy product", async () => {
  const code = await source("lib/legacyStripeMembership.ts");
  assert.match(code, /metadata\.studioUserId/);
  assert.match(code, /String\(metadata\.studioUserId \|\| ""\) === userId/);
  assert.match(code, /LEGACY_PICKAXE_STUDIO_ID/);
  assert.match(code, /legacyProductIncludesFitness\(metadata\)/);
  assert.match(code, /normalizeEmail\(user\.email\) !== email/);
});

test("legacy matching rejects canceled, ambiguous, cross-email, and already linked records", async () => {
  const code = await source("lib/legacyStripeMembership.ts");
  assert.match(code, /\["active", "trialing"\]/);
  assert.match(code, /stripeSubscriptionIsActive\(subscription\.status\)/);
  assert.match(code, /matches\.length !== 1/);
  assert.match(code, /customer\.deleted === true/);
  assert.match(code, /normalizeEmail\(customer\.email\) !== memberEmail/);
  assert.match(code, /existing\.stripe_subscription_id/);
  assert.match(code, /existing\.access_active !== true/);
});

test("database links only an existing active legacy member and cannot overwrite a paid record", async () => {
  const code = await source("lib/fitnessMembershipDb.ts");
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS fitness_memberships_subscription_idx/);
  assert.match(code, /stripe_subscription_id IS NOT NULL/);
  assert.match(code, /AND clerk_user_id = \$\{args\.clerkUserId\}/);
  assert.match(code, /AND access_active = TRUE/);
  assert.match(code, /AND stripe_status = 'legacy_pickaxe_member'/);
  assert.match(code, /AND stripe_customer_id IS NULL/);
  assert.match(code, /AND stripe_subscription_id IS NULL/);
  assert.match(code, /AND NOT EXISTS/);
  assert.doesNotMatch(code.slice(code.indexOf("export async function linkLegacyFitnessMembershipBilling"),code.indexOf("export async function saveFitnessMembership")),/SET access_active/);
});

test("only verified Clerk email addresses may trigger historical billing links", async () => {
  for (const path of ["app/manage-subscription/page.tsx", "app/api/billing/customer-portal/route.ts"]) {
    const code = await source(path);
    assert.match(code, /verification\?\.status === "verified"/);
    assert.match(code, /emailVerified/);
    assert.match(code, /linkVerifiedLegacyStripeMembership\(email, user\.id\)/);
  }
});

test("Stripe webhook identifies old subscriptions through their saved binding and checks current status", async () => {
  const code = await source("app/api/billing/webhook/route.ts");
  assert.match(code, /getFitnessMembershipBySubscriptionId\(subscriptionId\)/);
  assert.match(code, /String\(linked\.stripe_customer_id \|\| ""\) === customerId/);
  assert.match(code, /\/subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}/);
  assert.match(code, /stripeSubscriptionIsActive\(status\)/);
  assert.match(code, /currentSubscriptionId !== args\.subscriptionId/);
  assert.match(code, /const clerkUserId = string\(record\(object\.metadata\)\.clerk_user_id\)/);
  assert.match(code, /if \(email && clerkUserId && subscriptionId && customerId && paid\)/);
});

test("grandfathered membership remains separate from subscription linkage", async () => {
  const code = await source("lib/fitnessMembershipDb.ts");
  assert.match(code, /stripeStatus: "legacy_pickaxe_member"/);
  assert.match(code, /eventType: "legacy_sync"/);
  const linked = code.slice(code.indexOf("export async function linkLegacyFitnessMembershipBilling"),code.indexOf("export async function saveFitnessMembership"));
  assert.doesNotMatch(linked,/revokeFitnessAccess|grantFitnessAccess/);
});
