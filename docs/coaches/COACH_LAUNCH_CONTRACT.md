# Reusable Coach Launch Contract

**Current state:** Foundation only. The dashboard catalog is live-code-ready but this branch is **preview only**. No new coach, Stripe tier, Pickaxe access group, shared allowance, saved-work migration or agent is activated.

## Already standardized
- Registry: `lib/coachLaunchCatalog.mjs` (with typed declaration) lists each coach with an internal slug, display copy, image, coach route, saved-work route, history ownership and metering mode.
- Guard: Only `availability:"member"` and an approved release-gate result may appear in the member dashboard. Career is deliberately `availability:"unreleased"`, `href:null`, and `releaseGate:"never"`.
- Dashboard: cards and My Tools links derive from the same list. Existing Fitness, Budgeting and Life destinations are unchanged.
- No provider secrets or payment account IDs belong in this public registry. It describes UI, **not an authorization source**.

## Per-coach launch contract
1. **Purpose:** Define the specialty and data boundaries; prepare prompt, knowledge, model and applicable safety tests.
2. **Provider:** Configure provider credentials strictly server-side; never grant access by client-supplied coach slug alone.
3. **Membership:** Reuse the existing verified Clerk login and linked Stripe subscription, with no extra checkout or Pickaxe payment link. Grandfathered $15/400 subscriptions stay untouched.
4. **Usage:** Use the same authoritative wallet and request-id reservation/settlement. Never count free history reads as generation. Block unavailable or unapproved coaches.
5. **Saved work:** Keep coach-specific data and ensure history survives sign-outs, restarts, billing transitions and coach additions.
6. **Cost:** Verify model, context overhead, extra inference/retries and actual cost per *completed member message* across provider runs. Reject malformed/missing cost data rather than assuming zero. Establish p50/p95 and full-usage budget.
7. **Frontend:** Register safe routes and assets; then use the dashboard catalog, check mobile and accessibility, and update the public marketing page only upon release approval.
8. **Testing:** Signed-in synthetic customer; existing member continuity; history reopen; all coach saved tools; high-use, errors, retries, duplicate prevention, subscription/cancel/reactivate; access denied to disabled agents.
9. **Release:** Explicit owner sign-off after successful preview + billing/usage/profitability verification; controlled rollout and revert that preserves saved data.

## Outstanding work before claiming "one-step coach launch"
- Align Life-specific access/release conditions with a common gate *without weakening* verified membership checks.
- Integrate server-side provider configuration, centralized quota categories and consistent persistence adapters.
- Establish complete per-message costs in all apps, including Budgeting's separately routed functionality (draft PR #232 is preliminary, not merged).
- Create a small stable test fixture and automated smoke suite for common membership and coach journey.
- Keep the four-tier billing implementation separate until unit economics and Stripe payment/allowance reconciliation are approved (#229, #231).

This framework is incremental to avoid breaking the existing customer experience. The next Career Coach release will be our first proof of the complete workflow.

## Standard server authorization adapter (new)
The reusable `lib/coachMemberAccess.ts` now defines `authorizeNewCoachLaunch(slug, checks)` for a **future coach endpoint**. It rejects unregistered/unreleased slugs before membership checks, demands the full launch-readiness facts, requires a signed-in Clerk account with verified primary email, and verifies membership through the existing database-backed access function with legacy Pickaxe-list fallback disabled. Database failures fail closed. This is not used by existing Fitness, Budgeting or Life endpoints and cannot grant Career Coach access while Career remains disabled. Integrate only after a coach-specific route with validated usage reservation and history ownership exists.

The launch gate is complementary to, not a replacement for, the server-side authorization inside every chat request. The client may never submit its own approval facts: callers must derive readiness from trusted deployment settings and recorded release approval. No billing/usage changes.

## Reusable turn core (October 27)
`lib/newCoachTurnCore.mjs` with TypeScript declarations adds a dependency-injected workflow for **future** coach chat endpoints. It requires authenticated/authorized identity (supplied by the server only), one shared-wallet reservation, generation, durable coach-specific save, settlement and optional sanitized metrics. Missing provider cost is unknown, not zero. Multiple upstream attempts count toward the one customer-visible reply; failures after inference are held as `uncertain` so charged work cannot be replayed blindly. No member messages or identity are logged by the core. `lib/newCoachUsageAdapter.ts` reuses the existing shared wallet only for its three approved categories; Career is deliberately NOT enabled until reviewed ledger expansion. No existing chat endpoint is changed.

**Remaining before all-coach one-step release:** provider-specific implementation, durable coach-scoped persistence and readback adapter, verified cost responses (and Budgeting deployment coverage), a new centrally approved quota category and migration, synthetic authenticated E2E smoke, plus final owner release approval. This contract is not a live Career Coach.
