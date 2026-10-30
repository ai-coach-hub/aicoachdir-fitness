# Production Stripe catalog audit — October 29, 2026

Read-only evidence collected from the connected live Stripe account and the production Neon `billing_config` table. No subscriptions, products, prices, or wallets were changed.

## Verified legacy protection
- Current configured legacy price: `price_1U4O0zKpjSTJJd3TJS6FRjPx`
- Amount: $15 per month. Existing customers receive 400 messages under the grandfathered policy.
- **Do not** map this legacy price to Growth ($15/200), as that would silently reduce existing benefits.

## Proposed new price catalog (not approved for use)
| Tier | Monthly USD | Messages | Verified exact-match live price |
| --- | ---: | ---: | --- |
| Starter | $9 | 100 | Multiple $9 prices exist; not identified as the new product |
| Growth | $15 | 200 | Multiple $15 prices exist; cannot reuse the legacy price |
| Premium | $25 | 400 | **No matching active monthly price exists** |
| Elite | $35 | 600 | **No matching active monthly price exists** |

The live Stripe account returned 14 active recurring prices, none at $25 or $35. No mappings were inferred from dollar amounts alone.

## Release must remain blocked until
1. Create or approve **distinct**, correctly named live products and prices for all four tiers, verify the Stripe account and USD monthly recurrence, and store approved mappings without modifying legacy subscriptions.
2. Apply and verify a separately reviewed, additive production upgrade-intent migration.
3. Reconcile existing member wallet periods at their verified billing renewals without resetting usage history.
4. Implement and test paid-invoice webhook reconciliation and downgrade scheduling at renewal (including customer-visible descriptions and rollback).
5. Pass the production release gate, deploy, and observe real outcomes with safe limited rollout.

This audit documents a real blocker. It does **not** authorize creating live subscriptions, migrating customers, or enabling a public upgrade button.
