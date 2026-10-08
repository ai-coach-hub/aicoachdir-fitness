# Unified member account and billing — design (2026-10-08)

## User outcome and constraints
Older Pickaxe subscribers and newer website Stripe subscribers use one AI Coach Directory login and a consistent Fitness, Budgeting, saved-history and billing-management experience. Do not create or replace subscriptions, recharge existing members, delete chat/workout records, change the $15 plan, or revoke current paid access as a side effect of linking. Keep cancel-at-period-end and the unobtrusive Manage Subscription link. No manual screenshots or repeated onboarding.

## Current verified implementation
- Clerk identifies the signed-in member; the membership table `fitness_memberships` is indexed by canonical email and has optional `stripe_customer_id` and `stripe_subscription_id` fields.
- Active legacy Pickaxe access can grant website membership without a Stripe identifier. The current billing page and Stripe portal endpoint only find the Stripe customer ID in that table, so the legitimate legacy user is shown a fallback.
- Fitness, Budgeting and Checkout call `memberHasFitnessAccess`. Checkout's legacy-list lookup can be disabled; the paid member must not be sent into a duplicate checkout.
- Stripe live subscriptions include two distinct metadata patterns: website purchases use `member_email` and `clerk_user_id`, whereas Pickaxe purchases use `studioId`, `studioUserId` and `productIds`. Read-only audit on October 8 showed 19 subscriptions (13 active, 6 canceled), one with website-style metadata and 18 with vendor-style metadata. This sample is not a census of all Pickaxe portal members.
- Stripe's current live default portal is associated with Pickaxe, and cancellation is configured at period end. The website's secure portal creation route currently depends on the locally saved customer ID.

## Design
### Authoritative identity and linking
Clerk's verified signed-in identity initiates lookup. Keep Pickaxe user ID and Stripe customer ID as external identities, never as interchangeable account IDs. Use a new, additive linkage table or columns that track verified Stripe customer/subscription references, source (website or Pickaxe), verified-at, and reconciliation status. Preserve existing membership rows and all user/workout/chat records.

For the website path, retain the already verified Checkout->Clerk linkage. For Pickaxe, require an exact normalized email match between the verified Clerk email, the exact Pickaxe member, and the Stripe Customer's email, plus a matching live Pickaxe studioUserId where exposed. Email alone is not sufficient to resolve duplicates. Require unique customer/subscription identity and consistent membership ownership. For changed emails, aliases, duplicate customers, multiple active subscriptions or conflicting identities, decline automatic linking; offer a discreet support route rather than guessing or showing another customer's billing data.

Do not mutate Stripe customer email, payment methods, subscriptions or Pickaxe user IDs during reconciliation. Never grant paid access based solely on finding a historical or canceled Stripe customer.

### Membership and cancellation
A single membership resolver evaluates active website-paid subscriptions and pre-existing Pickaxe entitlements independently, keeping existing valid grants. Legacy account access must not be revoked solely because the website has no Stripe customer ID. Verify period-end cancellation using Stripe status plus `cancel_at_period_end` and actual period-end timestamps: a subscription remains active through its paid-through end, then becomes ineligible after cancellation. Never revoke a member who has a second independently active paid entitlement. Do not change webhook endpoints until vendor ownership and cancellation behavior are verified. Avoid changing Pickaxe's own subscription lifecycle from the website.

### Member UX
Use the same Clerk login and member landing experience with Fitness, Budgeting, My Workouts, and existing history links. Render one understated Manage Subscription entry. For safely linked accounts, generate an authenticated, server-side Stripe portal session for only the verified customer; never accept user-provided customer IDs. For unlinked/ambiguous memberships, show a neutral 'We need to confirm your billing account' message and one simple support path, rather than describing users as 'older' or pushing them into a new checkout. Keep navigation to the coaches working independently from billing-link availability.

### Security and operational controls
Match using authoritative server-side records, not an untrusted query or free-text email. Protect the portal POST against cross-site requests and arbitrary return origins; check session identity, customer ownership and active subscription in Stripe before session creation. Keep personal customer data and Stripe keys out of logs. Apply server-side rate limiting, no-store responses and idempotent durable reconciliation. Do not rely on a user's browser to sync records.

### Deployment, audit and rollback
Stage 1: read-only, aggregate-only audit of website, Stripe and Pickaxe cohorts. Separate legacy-Pickaxe-only, website-paid, multiple-match, canceled-but-paid-through, fully expired and unmatched categories; do not expose member email addresses in artifacts.
Stage 2: unit and integration tests, test-mode portal and a preview environment that never reaches live Stripe.
Stage 3: limited feature-flagged linking for uniquely matched accounts. Monitor false negatives, conflict counts, access regressions and duplicate-charge prevention. Never create a subscription during linking.
Stage 4: production rollout after manual verification of older and newer test-member pathways. Confirm billing portal owner/return URL and correct cancellation behavior, and confirm both coaches/history function throughout the billing period and stop appropriately afterward.
Rollback: disable the new resolver/portal-link feature flag; preserve additive linkage data for investigation; leave original billing and access rules untouched. No bulk destructive migrations.

## Acceptance tests
1. Legacy active subscriber signs in and opens both coaches, existing workouts, chats and billing page; no Stripe checkout or second charge.
2. New subscriber retains the same functionality and opens only their Stripe customer portal.
3. Safely matched legacy Stripe/Pickaxe record can manage the existing Stripe subscription without creating a new one.
4. Ambiguous/duplicate/mismatched/changed-email identity cannot open someone else's portal and instead receives clear support guidance.
5. Cancel-at-period-end displays the correct paid-through date, preserves both coaches until expiry, and causes no renewal; expired subscription denies access unless another valid entitlement exists.
6. Temporary Stripe/Pickaxe/network outage cannot rewrite membership ownership, revoke unrelated entitlements, or trigger another charge.
7. Cancellation webhook replay/out-of-order updates are idempotent and do not resurrect expired access.
8. The live homepage and member portal retain discreet cancellation access, with no extra login prompts for existing signed-in users.

## Items to validate before implementation
- Which Pickaxe API record reliably links a user to `studioUserId` and Stripe Customer ID; do not assume an undocumented relationship.
- How to handle independently paid Pickaxe users whose subscription belongs to a different Stripe connected account: never create a cross-account portal session or imply it is managed by the website.
- Actual migration account cohort counts and whether post-cancellation access ends correctly in the currently deployed Pickaxe + Neon pathways.
- Verify the live Stripe restricted key permits listing customers/subscriptions and creating portal sessions before enabling the new UI.

## Non-goals
No billing provider migration, no forced account conversion, no subscription price change, no bank connections, no coach prompt changes and no data deletion.
