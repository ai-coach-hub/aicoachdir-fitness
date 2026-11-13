# Native coach action parity — public introductory trial release gate

**Current result: BLOCKED.** Text-coaching proof is not equivalent to access to saved workouts, monthly budget tracking, and saved Life goals. The live site is not changed. Keep PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED unset.

## Grounded service ownership (2026-11-03)

| Feature | Real implementation | Source of truth / gate | Status for trial |
| --- | --- | --- | --- |
| Fitness chat + workout validation, scheduled saves, completion | Main hub: `app/api/fitness/chat/route.ts` (about 3000 lines) | Verified paid/legacy membership, Pickaxe memories/actions, saved workout readback | NOT integrated into trial |
| Budgeting coaching, saved months and manual expenses | Separate `ai-coach-hub/aicoachdir-budgeting` project: `app/api/chat/route.ts` and `app/api/budget/route.ts` | `aicoachdir-budgeting.vercel.app`; signed hub handoff, membership check, separate Neon budget database, authenticated browser token | NOT integrated into trial |
| Life Coach goals, recall and history | Main hub: `app/api/life/chat/route.ts`, `lib/lifeCoachStore.ts` | Verified paid member, per-Clerk-ID goal and conversation storage | NOT integrated into trial |
| Shared 15-message chat and conversation history | Main hub: `/api/introductory-trial/*`, `public.introductory_trial_*` | Verified Clerk + historical Stripe/Pickaxe + lifetime grant | Implemented; staged only |
| Stripe conversion from trial | Main hub checkout success + signed Stripe webhook | Stripe live paid invoice + same verified member and subscription | Implemented; staged only |

## Why a direct bypass is unsafe

The main hub's Fitness and Life routes check paid/legacy membership before invoking Pickaxe actions; Budgeting independently checks paid access on **each** tracker read/write. Never treat a free trial grant as a paid member, mint a paid member cookie, or bypass paid checks in a helper. Do not run production-coach tests using an unrelated account's saved plans or budget.

The new `publicTrialNativeActionSafety.ts` blocks likely saved-work mutations before the trial ledger is debited. This is a **temporary safety measure**, not feature parity. Its patterns are conservative, not a full natural-language permission system; do not consider it a substitute for real action integration.

## Required implementation for parity

- Fitness: trial-specific verified entitlement through the *existing* workout validation and Pickaxe action pipeline, with a distinct scope for trial data; test save/readback, this-week/next-week, modify, mark complete, history after conversion, and idempotency. No automatic paid access grant.
- Budgeting: coordinated **draft PR** in `ai-coach-hub/aicoachdir-budgeting`. Establish a new audience- and expiry-bound signed trial handoff from the main hub to the budget service; require an independent server-to-server trial status check. Never reuse the existing paid member cookie as a trial cookie. Read/write the same member-month budget record during and after conversion, preserving rollover adjustments and not duplicating spending.
- Life: map a verified trial entitlement into the existing goals/memory APIs without opening unmetered model generation. Confirm saved goals and associated chat persist after conversion under the same Clerk ID.
- For all coaches: one central `intro_trial_reserve` before generation, verified saved result before `intro_trial_settle(...,completed)`, release only proved no-model failures, and hold uncertain outcomes for operator reconciliation. Never generate extra trial credits for retry or a second identity.
- Review that the user-facing trial explains whether native tools are offered. Do not advertise saved tools until the above actions pass.

## Release gates and exact checks

1. Finish a coordinated cross-repo PR; keep main hub PR #251 in DRAFT.
2. Run static and branch-isolated tests for new, paid, grandfathered, exhausted, converted, mismatched Clerk ID, stale Stripe, legacy Pickaxe, partial provider outages, and repeated request keys.
3. Prove live-provider action save AND readback on isolated test member for each coach. Record whether each trial message costs exactly one of 15.
4. Confirm the same saved workout/budget/goal remains available in the paid coach after *one* verified test conversion; no duplicate checkout.
5. Obtain production migration approval and a reviewed rollback, then apply *additive* migration with database branch check.
6. Only after explicit launch approval set the five release gates. A simple production build or passing generic regression tests does not establish parity.
