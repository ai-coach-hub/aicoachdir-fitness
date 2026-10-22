# Life Coach + shared 400-use wallet — production release gate

Evidence reviewed: 2026-10-22. Status: **NOT RELEASED**. This file is the release checklist; do not infer launch approval from CI or a ready Preview.

## Confirmed implementation and automated QA
- Fitness/Life: GitHub branch `feature/life-coach-agent-sandbox-20261011`. Full GitHub regression tests and TypeScript passed, CI run #39857859239 (2026-10-22). The branch includes main's retired-login protection and a verified production Neon branch check; this CI success does not authorize merge or release.
- Matching Fitness Vercel Preview deployment: `https://aicoachdir-fitness-5dm9qkv34-kcb3.vercel.app`, state READY, target preview.
- Budgeting: branch `feature/shared-usage-cross-app-qa-20261021`, commit `a107b2c3259b61a6705c9425f2f7d0f4f18979f9`. Vercel Preview READY.
- The Budgeting-to-Fitness signed hub adapter now verifies result status and approved hostnames; the Fitness hub has a production implementation behind release flags.
- Production shared meter reads the existing approved $15/month Stripe price from the authoritative `billing_config` record; separately reviewed older price IDs may be explicitly added, never inferred from names.
- Previously approved grandfathered accounts can be rechecked with the already-existing historical membership verifier, then the quota resolver reloads their current membership row before approval. A failed check, stale result, missing stable Clerk link, or revoked access cannot grant fresh allowance.
- The public Life Coach homepage card, membership copy, and denied-account messaging are now conditionally prepared; the Life listing remains Coming Soon until the actual release approvals are enabled.
- New SQL migration includes operator-only reconciliation of uncertain provider outcomes. No public AI endpoint can reconcile ambiguous usage; the `shared_ai_*` SQL functions revoke PUBLIC execution privileges.

## Verified production Neon state, 2026-10-22
Project `aicoachdir-terms-db`, production branch `br-sparkling-glitter-aucpz59d`.
Confirmed directly in production (aggregate membership data; no user content exported):
- 3 active Stripe-linked memberships (including the owner account); 1 canceled Stripe-linked membership.
- 1 owner-approved retired former school login (`retired_owner_requested`); 1 separate active private QA legacy login (no Stripe subscription). The retired login remains blocked by the live fallback guard. Neither account should be counted as a paid grandfathered subscriber.
- All 6 membership records remain intact and production fitness checkout reservations still exist.
- Both shared-wallet tables and both Life Coach conversation tables were installed in production.
- Production functions `shared_ai_reserve`, `shared_ai_settle`, and `shared_ai_reconcile` were installed and checked for limited public privileges.
- Usage wallet records: **0**; current-cycle balances have NOT been imported or reconciled. Life Coach conversation rows in production: **0**.
- Production SQL reports `br-sparkling-glitter-aucpz59d`; private Preview SQL reports `br-autumn-breeze-auw38rgr`. Both Life storage and shared wallet now reject a wrong production branch in tests.
- The preview schema is not a drop-in replacement for production. Do not copy or overwrite live membership or workout data.

## Additive migrations — INSTALLED, NOT A RELEASE
Production SQL Editor migration completed, then three wallet functions installed via connected Neon. Direct read-back verified tables/functions. The source migrations remain at:
1. `migrations/20261022_shared_ai_usage.sql`
2. `migrations/20261022_life_chat_private_to_production.sql`

**Do not rerun these migrations to try to activate the feature.** No public coach release flags are enabled. Prior verification and usage reconciliation remain required.

Read-only post-migration checks (run on the production branch):
```sql
SELECT
 to_regclass('public.fitness_memberships') IS NOT NULL AS memberships_preserved,
 to_regclass('public.fitness_checkout_reservations') IS NOT NULL AS checkout_preserved,
 to_regclass('public.shared_ai_usage_periods') IS NOT NULL AS ledger_periods_ready,
 to_regclass('public.shared_ai_usage_requests') IS NOT NULL AS ledger_requests_ready,
 to_regclass('public.life_chat_threads') IS NOT NULL AS life_threads_ready,
 to_regclass('public.life_chat_messages') IS NOT NULL AS life_messages_ready,
 to_regprocedure('public.shared_ai_reserve(text,text,timestamptz,timestamptz,integer,text,text)') IS NOT NULL AS reserve_ready,
 to_regprocedure('public.shared_ai_settle(text,text,timestamptz,text,text)') IS NOT NULL AS settle_ready,
 to_regprocedure('public.shared_ai_reconcile(text,text,timestamptz,text,text)') IS NOT NULL AS reconcile_ready;
```

## Release blockers that MUST pass before switching on shared billing
1. **Migration and environment pinning — COMPLETE**: four additive tables and three wallet functions are present in production; six existing membership records and checkout table preserved. Exact production Neon branch checks pass CI. Do not reapply migration or silently rekey customer identities.
2. **Initial usage accounting**: reconcile existing member usage within their current billing periods from the actual Fitness/Budgeting model providers, or explicitly approve a one-time starting-balance policy. The new Neon wallet starts empty; activating midcycle without this decision could grant more than 400 total AI requests. Never make up balances or silently reset them.
   Existing server integration already supports the documented read-only Pickaxe `GET /studio/user/<email>` API. Pickaxe reports `currentUses`, `extraUses`, and `totalUses` fields in its user records (see https://pickaxe.co/v1/documentation/user and the linked Pickaxe community support discussion). Their meaning relative to monthly consumed AI requests MUST be verified before seeding balances; do not assume that any one field is the usage consumed this billing period. Obtain a provider-side timestamped activity reconciliation for Fitness and Budgeting where necessary, without sending user conversations to another service.
3. **Legacy parity**: the school login is retired and the other unlinked legacy row is a QA account, not a verified paid grandfathered customer. Keep both identities and saved data intact. Independently verify any genuinely grandfathered/restored paid subscriber against current Pickaxe/Stripe authority before issuing a wallet (no repurchase). Review `SHARED_USAGE_LEGACY_PERIOD_MODE=utc_calendar` only for an actually verified non-Stripe entitlement. Preserve existing cancellation/reactivation behavior.
4. **Billing IDs**: audit old/current Stripe price IDs against the existing $15 plan. Only explicitly approved historical price IDs belong in `SHARED_USAGE_APPROVED_PRICE_IDS`. The current live price comes from `billing_config`; do not create a Stripe price or checkout here.
5. **Service credentials**: Budgeting's production `SHARED_USAGE_HUB_ORIGIN` is configured with the canonical verified Fitness hostname. The `BUDGET_MEMBERSHIP_HANDOFF_SECRET` remains sensitive and equality across the two projects still needs a signed server-to-server test without disclosure. Fitness production has no `PICKAXE_LIFE_COACH_DEPLOYMENT_TOKEN` configured; provision an independently authorized production Life Coach deployment credential before activating Life generation.
6. **Production-shaped private verification**: prove server-authorized reservation and settlement against the correct database from all three coach handlers; quota exhaustion, cross-member isolation, duplicate retries, provider-timeout reconciliation, canceled vs. cancel-at-period-end access, and non-AI workout/budget operations. A synthetic preview counter by itself is not sufficient.
7. **Feature flags/release**: the production shared meter in BOTH Fitness and Budgeting additionally requires `SHARED_USAGE_OPENING_BALANCES_RECONCILED=true`; Life access, history and model generation also require this confirmation. Keep `SHARED_USAGE_GATE_ENABLED`, `SHARED_USAGE_PUBLIC_RELEASE_APPROVED`, `SHARED_USAGE_OPENING_BALANCES_RECONCILED`, and `LIFE_COACH_LIVE_ENABLED` disabled until every above gate passes. The opening-balance flag may be set true ONLY after documented, independently verified existing-period usage reconciliation or an explicitly approved alternative cutover policy. Stage and verify production-configured builds **without** public aliases first; then release all affected services in a coordinated, reversible window.
8. **Postrelease**: watch generated requests, pending reservations, provider spend, payment/webhook errors and customer access. Keep the last known-good production deployments available for rollback.


## Forward-only rolling migration (private implementation; activation not approved)

Why: The production Neon membership table does **not** contain every active historical Pickaxe member. Terms acceptance is not evidence of payment. Neither a static three-person allowlist nor retroactive credit estimates are an acceptable migration plan.

- Identify the account dynamically from the existing authenticated Clerk or signed Budgeting session. The existing `memberHasFitnessAccess` login path may recognize previously unrecorded **currently entitled** Pickaxe members and restore their membership record. Never grant a subscription from a Terms acceptance, arbitrary email, or an unverified Pickaxe lookup.
- Configure `SHARED_USAGE_MIGRATION_MODE=rolling_renewal` in **both** production projects (not yet set) only with `SHARED_USAGE_GATE_ENABLED=true`, `SHARED_USAGE_PUBLIC_RELEASE_APPROVED=true`, and an identical canonical UTC `SHARED_USAGE_CUTOVER_AT`. An absent/invalid cutover fails closed.
- In rolling mode, `SHARED_USAGE_OPENING_BALANCES_RECONCILED` remains **false**. No fake zero balances, bulk imports, one-time giveaways, invented payment history, or user enumeration are required.
- An active member whose **verified Stripe** billing period started before the cutover continues using the original Fitness and Budgeting chat paths and provider access. The server returns signed `pending_renewal` and does NOT call the central quota reservation or settlement. Existing subscription, renewals, saved history, and third-party allowance stay unchanged.
- After a real Stripe billing renewal with `period_start >= cutover`, the first eligible AI request automatically creates the ordinary shared 400-use wallet for that member. Fitness, Budgeting and Life use the same HMAC member identity and wallet within that period. No second checkout is initiated.
- Verified Pickaxe legacy members without a matched Stripe subscription retain existing service access. A bound, verified Clerk member may use the previously approved calendar-month legacy window. Their first **new** UTC month after the cutover can join the shared wallet. A legacy Budgeting-only member without a verified Clerk binding remains on the preexisting service; signing into the Fitness member flow can bind the already-verified identity without additional charges.
- An account with no verified membership, a canceled subscription, a retired membership, or an explicit internal QA exemption must **never** receive the new shared wallet nor the provider fallback. The old provider path is available only to a currently authenticated, individually verified member during rolling migration.
- Life Coach is displayed as **rolling out at renewal**, not as already available for every mid-cycle account. A paid model request before the eligible billing period returns an honest renewal message, without sending provider requests or generating a new 400-use allowance. Free saved-history functionality remains protected by the same verified identity.
- Alternative reconciled mode (no explicit migration mode or `reconciled`) remains supported and requires independently verified opening wallet records and `SHARED_USAGE_OPENING_BALANCES_RECONCILED=true`. Do not mix the two modes during one release.
- Test both Vercel projects with the **same** cutover, matching cross-service secrets, signed Budgeting calls, duplicate requests, failed settlement, actual Stripe renewals, cancellations and real provider replies. The Life production deployment credential is a separate required setup and must be configured as a protected Vercel Production secret.
- Do not activate flags until live provider and cross-account tests pass. Never use current customers as involuntary QA. During rollout log only non-sensitive status aggregates and monitor reservations, uncertain outcomes and member errors.

These safeguards prepare a roster-independent launch without silently resetting any member's allowance. Code and synthetic CI are not proof of a finished public launch.

## Commercial policy already approved
Current eligible $15 / 400-use subscribers gain Fitness + Budgeting + Life **within the same monthly wallet**, with no second subscription or charge. Career stays unreleased. New four-tier pricing is not yet approved. No new Stripe products or prices are authorized by this change.

Never claim an automated green CI run is a production-grade paid-user end-to-end proof. Do not use existing paying customers as involuntary testers.
