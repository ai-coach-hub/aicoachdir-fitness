# AI Coach Directory - Draft Bundle and Entitlement Matrix

Status: REVIEW DRAFT ONLY. Not a pricing approval, Stripe change, or production entitlement. Updated 2026-10-12.

## Protect existing customers first

The website currently advertises $15/month for Fitness Coach + My Workouts and Budgeting Coach + My Budget with 400 shared monthly AI uses. Existing membership access, including cancellation through the paid period and legitimate re-subscription after lapse, must stay exactly as it is until an explicitly approved migration is implemented. Do not add Life Coach or Career Coach to this paid offering just by changing a homepage button.

## Candidate bundle families

Recent product planning considered a three-bundle family, each with three usage/pricing tiers:

| Bundle candidate | Coach chat access | Companion tools | Proposed tier names |
| --- | --- | --- | --- |
| Budgeting Only | Budgeting | My Budget, manual entry only | Starter / Growth / Elite |
| Fitness + Life | Fitness and Life | My Workouts | Starter / Growth / Elite |
| All Four | Fitness, Budgeting, Life and Career | My Workouts and My Budget | Starter / Growth / Elite |

This candidate should NOT be treated as finalized. An older Stripe catalog still uses a Career-only family instead of Budgeting-only, and names Basic/Growth/Pro instead of Starter/Growth/Elite. The exact bundle families and names require a single final owner decision, not automatic migration based on legacy product names. There is no bank-account connection for My Budget.

## Pricing and included-use matrix

Do not invent new prices or allowance numbers before measuring real costs. The current published $15/400 membership is not one of these automatically created new bundle tiers.

| Candidate | Starter | Growth | Elite |
| --- | --- | --- | --- |
| Budgeting Only | Price / AI-chat uses TBD | Price / AI-chat uses TBD | Price / AI-chat uses TBD |
| Fitness + Life | Price / AI-chat uses TBD | Price / AI-chat uses TBD | Price / AI-chat uses TBD |
| All Four | Price / AI-chat uses TBD | Price / AI-chat uses TBD | Price / AI-chat uses TBD |

A month of non-AI tracker page views should not consume Pickaxe credits or model usage. Saved-history retrieval that bypasses Pickaxe should not be billed as a Pickaxe generation. Monitor model usage, failed requests, and any shared usage allowance across each accessible coach before choosing margins.

## Implementation direction - not yet wired to live billing

1. One Clerk login for every coach and tracker. Never require a second signup or another paid account when changing coach plans.
2. Resolve entitlements on the server from verified membership and Stripe subscription state, not from browser-selected coach IDs, emails, checkout return URLs, or merely the existence of an old Stripe product.
3. Associate allowed coaches and included monthly uses with the exact approved subscription plan/price identity. Define grandfathering explicitly for existing $15 members before any plan upgrade.
4. Preserve saved chats and tracker data when subscriptions cancel, lapse, resume, upgrade, or downgrade. Paid-through cancellations retain access until the confirmed period end. A lapsed member can re-check out without creating a second account or being double-charged.
5. Avoid creating or archiving any of the live catalog's existing Stripe products until all currently referenced price IDs and historic subscriptions are mapped. The connected catalog held 11 active products and 14 active recurring monthly price entries during the 2026-10-12 read-only review; "active" is catalog status, not proof of active subscribers.
6. Confirm Terms and checkout disclosures show the actual current plan name, price, interval, renewal/cancellation, allowed coaches, and usage allowance. Do not refer to future features as included unless released.
7. Fully test membership restoration, webhook replay/order, cross-member privacy, shared-use accounting, price upgrades/downgrades, and legacy Pickaxe members before enabling the new tiers.

## Unresolved release decisions

- Final three bundle families: Budgeting-only versus the older Career-only offering.
- Tier names: Starter/Growth/Elite versus existing Stripe Basic/Growth/Pro labels.
- Exact monthly prices, usage caps, and overage policy for each tier.
- Whether existing $15 members retain only Fitness+Budgeting indefinitely or receive a defined future upgrade.
- Whether Life Coach goes live as a standalone offering, part of Fitness+Life, or as an included benefit of another plan.

Until decisions and private testing are complete: keep Life Coach in private Preview and preserve the live $15 membership untouched.
