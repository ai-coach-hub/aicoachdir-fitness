# Unified Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give established Pickaxe subscribers and new website subscribers an equivalent account and billing-management experience without migrating or charging subscriptions again.

**Architecture:** Retain Clerk identity and existing access grants; reconcile external Stripe and Pickaxe identifiers through a separately stored, verified, idempotent link. Extend the authenticated billing page to use verified links and fail safely on uncertain matches. Deploy behind an off-by-default flag, leaving existing membership and subscription workflows unchanged until tested.

**Tech Stack:** Next.js 16 App Router, TypeScript, Clerk, Neon Postgres, Stripe API, Pickaxe API, Node built-in test runner, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-08-unified-membership-design.md`

## Global Constraints
- Never create, replace, or charge a subscription as part of account linking.
- Never delete chats, workouts, Pickaxe users, Clerk users, membership records or history.
- Preserve existing $15 plan, 400 uses, period-end cancellation, and paid-through access.
- Do not change vendor-owned Pickaxe subscription state or its Stripe configuration during rollout.
- Billing portal identity MUST be verified server-side; no customer ID from URLs, forms or headers.
- No external bank connections; no unrelated coach prompt or product changes.
- Preview must not call live Stripe; production feature remains off until reviewed.
- Leave working website and Pickaxe access paths operational when reconciliation is ambiguous.

## Review Focus
1. **Verified email with two Stripe customers:** test refusal to link or open portal, never select first match.
2. **Pickaxe alias with a different returned email:** test exact canonical identity check and refusal.
3. **Multiple subscriptions and one canceled:** test independent entitlements and selection ambiguity.
4. **Subscription canceled at period end versus already ended:** test continuity until exact expiry without premature access loss.
5. **Stripe outage or stale webhook replay:** test that the prior entitlement survives network failure and stale events cannot reinstate expired access.

---

### Task 1: Verify identity evidence and report cohort counts (read only)

**Files:**
- Create: `scripts/audit-membership-linking.mjs`
- Test: `tests/membership-link-audit.test.mjs`

**Interfaces:**
- Produces: `summarizeLinkCohorts({ localMembers, stripeSubscriptions, pickaxeMembers }): CohortCounts` (no emails, customer IDs, or names in output).

- [ ] **Step 1: Write failing fixture tests** for website-paid, Pickaxe-paid, ambiguous duplicate, canceled-at-period-end, expired, and unmatched cohorts; assert aggregate-only outputs.
- [ ] **Step 2: Run** `node --test tests/membership-link-audit.test.mjs`; expected failure because the summarizer is absent.
- [ ] **Step 3: Implement** the pure cohort classifier; live audit reads must be paginated, read-only and never mutate any billing or membership data.
- [ ] **Step 4: Run** focused test to PASS; run a carefully scoped aggregate audit and confirm the exact Pickaxe user ID field and relationship to Stripe's `studioUserId`. If no trustworthy relationship exists, mark those records unresolved and STOP automatic linking.
- [ ] **Step 5: Commit** audit/tests, with only aggregate counts in the review report.

### Task 2: Verified reconciliation and storage

**Files:**
- Create: `lib/memberBillingLinkCore.mjs`
- Create: `lib/memberBillingLinkDb.ts`
- Test: `tests/member-billing-link-core.test.mjs`

**Interfaces:**
- Consumes: exact identity fields validated in Task 1.
- Produces: `resolveVerifiedBillingLink(input): { outcome: "linked" | "ambiguous" | "unlinked"; customerId?: string; subscriptionId?: string; source?: "website" | "pickaxe" }`.
- Produces: `getVerifiedBillingLink(email: string, clerkUserId: string)`; `upsertVerifiedBillingLink(link: VerifiedLink)` through additive schema, unique constraints on linked Stripe identifiers.

- [ ] **Step 1: Write failing tests** covering exact confirmed website ownership, Pickaxe studioUserId matching, casing/whitespace, email alias mismatch, two customers, multiple subscriptions, canceled and expired subscriptions, duplicate conflicting owners, and Stripe outage; absence of vendor linkage must resolve `ambiguous` or `unlinked`.
- [ ] **Step 2: Run** `node --test tests/member-billing-link-core.test.mjs`; expected FAIL for missing resolver.
- [ ] **Step 3: Implement** pure verification plus additive database table with verified-at/source/ownership keys; no subscription creation; owner-conflict queries fail closed and keep old membership table unchanged.
- [ ] **Step 4: Run** focused tests and `npx tsc --noEmit`; both PASS.
- [ ] **Step 5: Commit** resolver, schema and tests.

### Task 3: Safe membership resolution and checkout guard

**Files:**
- Modify: `lib/fitnessMembershipDb.ts`
- Modify: `app/api/billing/create-checkout-session/route.ts`
- Modify: `app/fitness/subscribe/page.tsx`
- Test: `tests/member-access-billing-hardening.test.mjs`
- Test: `tests/unified-entitlements.test.mjs`

**Interfaces:**
- Produces: `resolveMemberEntitlement(email: string, clerkUserId?: string): Promise<{ active: boolean; sources: ("website" | "pickaxe")[]; verificationAvailable: boolean }>`.
- Existing `memberHasFitnessAccess` remains available for both coach entry points.

- [ ] **Step 1: Write failing tests** for independent entitlements, cancellation pending until period end, canceled/expired, second active subscription, Pickaxe active with no Stripe link, stale webhook replay, read failure and no duplicate-charge checkout.
- [ ] **Step 2: Run** focused tests; expected FAIL for missing resolver/guards.
- [ ] **Step 3: Implement** behind `UNIFIED_MEMBER_LINKING_ENABLED`, default false; protect paid users against repeated checkout; do not infer access from an old customer record. Preserve existing behavior while flag is off. Do not alter existing vendor-owned webhooks without separate confirmation.
- [ ] **Step 4: Run** focused tests plus full `node --experimental-strip-types --test tests/*.test.mjs` and `npx tsc --noEmit`; all PASS.
- [ ] **Step 5: Commit** entitlements and checkout protection.

### Task 4: Subscription portal and uniform account page

**Files:**
- Modify: `app/manage-subscription/page.tsx`
- Modify: `app/api/billing/customer-portal/route.ts`
- Create: `lib/verifiedBillingPortal.ts`
- Test: `tests/subscription-management-access.test.mjs`
- Test: `tests/verified-billing-portal.test.mjs`

**Interfaces:**
- Consumes: `getVerifiedBillingLink`, authenticated Clerk identity, Stripe read-only subscription/customer lookup.
- Produces: only an authenticated customer-specific Stripe portal redirect; otherwise a neutral support response.

- [ ] **Step 1: Write failing tests** for website account, safely linked Pickaxe account, other user's customer ID, duplicate emails/customer IDs, unlinked active Pickaxe account, no session, bad origin, no live Stripe in preview, temporary Stripe failure and cancellation-at-period-end.
- [ ] **Step 2: Run** focused tests; expected FAIL for missing portal resolver.
- [ ] **Step 3: Implement** no-store secure portal flow with fixed return origin, CSRF protection and modest server-side rate limiting; reuse saved customer only after verifying Stripe customer/subscription identity; don't expose IDs in HTML or logs.
- [ ] **Step 4: Replace** 'earlier billing system' copy with the same account-facing wording for every member and neutral support fallback; retain unobtrusive footer and member link.
- [ ] **Step 5: Run** focused tests, full suite and type-check; all PASS.
- [ ] **Step 6: Commit** portal and UX.

### Task 5: Flagged rollout and end-to-end checks

**Files:**
- Create: `tests/unified-membership-e2e.test.mjs`
- Modify: `README.md` (operational checklist, safe flag, rollback)
- No live data migration or billing mutations.

**Interfaces:**
- Consumes: Tasks 1–4 and environment flag `UNIFIED_MEMBER_LINKING_ENABLED`.
- Produces: deployment checklist with exact GitHub commit, preview build, production release and revert criteria.

- [ ] **Step 1: Write failing end-to-end checks** for legacy and new account portal paths, both coaches, history retention, absence of new checkout, ambiguities and cancellation-paid-through behavior.
- [ ] **Step 2: Run** focused tests to observe expected FAIL, then complete fixtures/code needed to PASS.
- [ ] **Step 3: Run** complete regression suite, type-check and production-compatible build; record exit codes.
- [ ] **Step 4: Deploy** to safe preview with live Stripe disabled and verify read-only sample links; inspect Vercel build/runtime logs.
- [ ] **Step 5: Release** behind disabled flag; after direct verification of linked legacy and new subscribers and explicit production readiness check, turn on for a small reviewed cohort. Don't change default Pickaxe Stripe configuration or existing subscriptions.
- [ ] **Step 6: Confirm** no extra sign-in or checkout, same coach and history, correct portal and period-end access. Monitor errors and cohort conflicts. Rollback by turning flag off; preserve saved links and original membership rows.
- [ ] **Step 7: Commit** verification and runbook and report actual deployed commit/status.

## Shipping gate
Do not deploy a linking path unless the Pickaxe-to-Stripe relationship is independently verified and the Stripe server key can read customer/subscription records. If not, ship only neutral consistent UX and safe support fallback. Never convert a guessed email match into portal access.
