# Production subscription rollout gates

This branch isolates **pure policy code and tests** from the 75-file sandbox upgrade PR. It does not modify a live Stripe price, member, subscription, wallet, or database schema.

## Approved business direction (not yet activated)

| Plan | Monthly price | Messages |
| --- | ---: | ---: |
| Starter | $9 | 100 |
| Growth | $15 | 200 |
| Premium | $25 | 400 |
| Elite | $35 | 600 |

Existing $15/400 subscribers remain on their original price and allowance while they keep their subscription. An explicit plan switch must warn that grandfathered terms will be lost; do not silently migrate them.

## Required before releasing live payment features

- Verify and explicitly approve **four live Stripe recurring prices**, their products and billing intervals. Never reuse sandbox IDs or treat unrelated existing Stripe prices as these plans.
- Add an idempotent, production-reviewed upgrade intent and atomic wallet migration with an isolated rehearsal; do not run the sandbox SQL directly on production.
- Reconcile existing shared-message usage at renewal. Production currently has members but no shared-wallet periods; do not mint an allowance or reset usage on a midcycle switch.
- Implement authenticated subscription modification and invoice quote endpoints using the verified live account, single subscription item, strict membership ownership, exact proration and payment confirmation.
- Implement Stripe-scheduled downgrades taking effect **at renewal**; do not decrease the current-period message limit or create immediate downgrade invoices.
- Verify signed invoice/webhook delivery, durable idempotency, eventual reconciliation, duplicate-event handling, declined payments and failed schedule changes.
- Confirm Fitness, Budgeting, and Life coaching all read the same entitlement and preserve stored conversations, workouts, budgets, and goals.
- Keep production mutation flags **off** until all gates pass, then use a controlled release and observe logs before exposing links to customers.

## Current safeguards

- Source policies are pure functions without Stripe/database side effects.
- Existing live $15/400 subscriptions must never be automatically assigned the proposed $15/200 Growth tier.
- Test-only / preview branch names, Stripe keys, Neon branch IDs and synthetic intents must never be deployed as a production billing implementation.
- No live price creation, migration, charge, deployment or merging of the sandbox PR has been authorized by this policy-only change.
