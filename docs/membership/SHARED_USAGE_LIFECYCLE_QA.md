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

## Remaining engineering gates before launch

1. **Authoritative subscription data:** Extend a trusted, backend-only Stripe verification boundary to obtain customer binding, correct billing-cycle start/end, cancel-at-period-end state and subscription status. Do not obtain billing-period data from client input or infer it from the calendar month. Verify Stripe's actual API payload shape before implementing.
2. **Legacy account policy:** Explicitly map old paying accounts and verified grandfathered entitlements; preserve original $15/400 terms and supported cancellation/reactivation behavior. Do not grant Life Coach under the old price without an approved policy.
3. **Ledger reconciliation:** Load prior periods before permitting a new allowance. Require server-only stable allowance families, and reconcile membership changes, upgrades/downgrades, payment recovery and refund/credit events. Never silently change a member's cap mid-period.
4. **Cross-coach enforcement:** Wire one atomic reserve/settle ledger to every eligible real Fitness, Budgeting and Life generation path. Current preview meter is isolated QA; it is **not** a sitewide production limit. Budgeting's manual entries and Neon-only memory reads must remain free.
5. **Cost and billing review:** Obtain representative model/provider-call costs and conservative usage economics before approving four-tier prices/limits. Do not create or alter Stripe prices, auto-charge overages, migrate live data or publish new tiers.
6. **Security and release:** Verify auth and idempotency at the real API boundary; test with preview fixtures, approved owner review and reversible deployment; maintain the existing public website until a separate launch decision.

## Source of truth

The pure policy is a preparation aid, **not an entitlement grant**. A type declaration cannot establish that Stripe or Clerk truly verified data: the future server-side adapter must do so and pass the prior usage period. Passing unit tests does not mean production metering or Life Coach launch is complete.
