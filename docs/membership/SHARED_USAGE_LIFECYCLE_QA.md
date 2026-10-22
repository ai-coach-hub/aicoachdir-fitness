# Shared AI usage and subscription lifecycle — private safety prototype

Updated: 2026-10-21
Status: OFFLINE POLICY + REGRESSION TESTS ONLY; NOT IN PRODUCTION.
Branch: feature/life-coach-agent-sandbox-20261011 (draft PR #175).
No Stripe customer records, payments, provider completions or live membership tables were accessed or modified for these tests.

## Scope completed

- `lib/sharedAiEntitlementPolicy.ts` contains a pure, deterministic decision boundary for an AI generation request.
- It requires a trusted, recently verified **server-side** subscription snapshot, stable authenticated Clerk ID, explicit approved coach list, approved allowance ledger family, valid usage limit and current billing-period boundaries.
- It permits active/trialing subscriptions only within the verified period; `cancel_at_period_end` can remain paid and active through the end of that period.
- It rejects canceled, past-due, unpaid, paused and incomplete statuses for **new AI generation** in this preparatory policy. **This is NOT a change to current members' live access or an approved grace-period policy.**
- New billing period at or after the prior period end may begin a new allowance. Reactivation with a different Stripe subscription ID during the **same** period preserves the same allowance ledger key, instead of minting another allotment.
- An overlapping billing period, rekey within the current period, or in-period allowance change is blocked pending reconciliation, rather than silently granting extra uses.
- A $15/400 legacy-membership fixture includes Fitness + Budgeting and **does not** implicitly include Life or Career. Future all-coach access needs an explicit entitlement decision.
- Invalid account IDs, request keys, subscription identifiers, malformed period dates and stale verification fail closed.
- `tests/shared-ai-entitlement-lifecycle.test.mjs` exercises all these cases entirely offline without creating any Stripe, Pickaxe or Neon record.
- `lib/stripeUsagePeriod.ts` and `tests/stripe-usage-period.test.mjs` parse a trusted subscription response **offline**, requiring the explicitly approved monthly price and a single unambiguous Stripe subscription item. Current Stripe API versions moved the billing-period fields from subscriptions to `items.data[]`; the parser supports that shape plus consistent older top-level fields, and rejects mismatches or ambiguous item configurations. See https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end.
- This parser does **not** read a Stripe account, establish customer ownership or approve a plan. The existing `getVerifiedSubscription` access check must be extended and integrated by a separate reviewed change.

## Verified billing-to-usage bridge (2026-10-21)

- `lib/sharedAiVerifiedUsageBridge.ts` composes the isolated, tested Stripe billing-period parser and shared usage decision policy, with dependency-injected server-only billing and prior-ledger readers.
- Identity must match the authenticated Clerk user ID; the verified billing customer's email, subscription ID, monthly approved price and billing-period timestamps must match the server-authorized membership binding.
- The prior ledger read is mandatory; read failure blocks the request rather than issuing a replacement allowance. The bridge does not trust request-supplied customer IDs, prices, or tier limits, and has no Stripe, Neon or Pickaxe side effects.
- `tests/shared-ai-verified-bridge.test.mjs` covers positive paid-through access, blocked Life access on the old Fitness/Budgeting plan, forged Clerk identities, wrong billing customers, wrong prices, canceled subscriptions, ledger outage and overlapping plan keys.
- GitHub regression tests and type-check succeeded. **This is an offline verified-policy bridge, not proof that real Stripe verification and all coach provider routes are connected.** No production access, billing, or usage counter changed.

## Preview-only three-coach shared-counter simulation (2026-10-21)

- Added `lib/previewSharedCounterSimulation.ts` and `POST /api/life/shared-counter-qa`. Authentication requires the verified, allowlisted private Clerk tester and existing opt-in preview test enrollment. Nothing is exposed from production, and no customer message is accepted.
- Fitness, Budgeting, and Life use the exact same synthetic preview subscription/period and atomic reservation/settlement SQL functions. A fourth or replayed request is rejected as appropriate when the synthetic cap is exhausted.
- This API returns only a plainly labeled synthetic result. It **never calls the real Fitness, Budgeting, or Life model**, does not modify workouts, budgets, Stripe, or production metering, and is not a proof of real-world cross-coach enforcement.
- Added `tests/preview-shared-counter-simulation.test.mjs` to validate shared cap, duplicate replay, invalid coach/key and provider-free isolation without any actual Neon writes. The existing owner-tested zero-credit privacy checks remain a separate completed gate.
- The only authorized path to real sitewide enforcement is mapping verified entitlements to all three live coach handlers with the same safe reservation and provider cost reconciliation. Keep the old $15/400 plan unchanged until that path has been reviewed end to end.

## Verified execution boundary — model calls remain blocked without entitlement (2026-10-21)

- Added `lib/verifiedSharedUsageExecution.ts`, a separate preparatory request-flow boundary. It executes `authorize` first, creates a meter only after approval, reserves before calling the provider, and settles or retains ambiguous requests through the existing preview usage orchestration.
- Added `tests/verified-shared-usage-execution.test.mjs`: checks denial on invalid identity, unapproved coach, billing failure and expired period; no generation when quota exhausted or duplicate; successful one-use settlement; non-model release; uncertain timeout reconciliation.
- GitHub regression tests and TypeScript checks passed for commit `aa50e45f9eae0529b232c60be1134f04ee625447`. Tests use fake provider/meter fixtures without contacting Stripe, Neon or Pickaxe.
- The module is **not imported by production coaching routes**. Connecting it to real request handlers and trusted billing records remains a release blocker. Current subscriber access and historical data were not changed.

## Consolidated integration audit and private read adapters (2026-10-21)

- Confirmed the actual Fitness AI handler is `app/api/fitness/chat/route.ts`, and the Budgeting coach is entered via `app/budgeting/launch/route.ts`, which forwards to an independently hosted Budgeting application. Thus **one shared quota is not yet enforced across those two deployed providers**, even though private synthetic counter QA passed.
- Added `lib/previewVerifiedBillingAdapters.ts`: server-authoritative, read-only Stripe customer/subscription verification and a branch-verified Neon prior-period reader. Both reject production environment, unexpected Vercel branch, and non-test Stripe keys before issuing a query.
- Added `lib/previewVerifiedUsageResolver.ts` to combine the existing entitlement policy, verified Stripe billing-period parser and isolated prior-period read into one preparatory decision. It grants **no subscription or Life Coach access** and does not reserve a model use.
- Added `tests/preview-verified-billing-adapters.test.mjs` for production/test isolation, correct Stripe customer/subscription lookup, wrong-email denial, private Neon branch denial, and past-period readback. Fixtures make no Stripe network requests and perform no DB writes.
- The preview test adapter will only run when a separate test-mode Stripe key is configured. It cannot read the production $15 subscriber list; the live-site data, memberships, and saved data are unchanged.
- **Do not directly insert a quota gate in the 133 KB Fitness chat route or the separately deployed Budgeting app without the corresponding approval, migration and integration test.** That could mistakenly deny paying users who currently rely on the legacy access path.
- Independent Budgeting code ownership and production provider usage/cost records must be inspected before real cross-coach accounting can be certified.
- Stripe subscription webhook coverage currently handles `checkout.session.completed` and `customer.subscription.updated/deleted`; invoice lifecycle reconciliation and billing period reset need additional tests before any public multi-tier migration.

## Remaining engineering gates before launch

1. **Authoritative subscription data:** Extend the trusted backend-only Stripe verification boundary to bind customer email and subscription ID, then use the separately tested Stripe period parser against the verified response. Do not obtain billing-period data from client input, infer it from calendar months, or assume every subscription has exactly one item.
2. **Legacy account policy:** Explicitly map old paying accounts and verified grandfathered entitlements; preserve original $15/400 terms and supported cancellation/reactivation behavior. Do not grant Life Coach under the old price without an approved policy.
3. **Ledger reconciliation:** Load prior periods before permitting a new allowance. Require server-only stable allowance families, and reconcile membership changes, upgrades/downgrades, payment recovery and refund/credit events. Never silently change a member's cap mid-period.
4. **Cross-coach enforcement:** Wire one atomic reserve/settle ledger to every eligible real Fitness, Budgeting and Life generation path. Current preview meter is isolated QA; it is **not** a sitewide production limit. Budgeting's manual entries and Neon-only memory reads must remain free.
5. **Cost and billing review:** Obtain representative model/provider-call costs and conservative usage economics before approving four-tier prices/limits. Do not create or alter Stripe prices, auto-charge overages, migrate live data or publish new tiers.
6. **Security and release:** Verify auth and idempotency at the real API boundary; test with preview fixtures, approved owner review and reversible deployment; maintain the existing public website until a separate launch decision.

## Source of truth

The pure policy is a preparation aid, **not an entitlement grant**. A type declaration cannot establish that Stripe or Clerk truly verified data: the future server-side adapter must do so and pass the prior usage period. Passing unit tests does not mean production metering or Life Coach launch is complete.
