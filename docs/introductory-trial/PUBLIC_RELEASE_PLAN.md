# Public introductory trial release plan — PR #251

**State: DEVELOPMENT ONLY — DO NOT MERGE/ACTIVATE.** The private one-time 15-message trial and its converted paid chat have been demonstrated and must not be replayed. This document specifies the separate public integration still required.

## Grounded architecture review (Nov 3, 2026)

- Existing signup: `app/fitness/signup` → TermsGate → Clerk `/fitness/create-account` → `/fitness/subscribe` → Stripe checkout.
- Existing dashboard: `/dashboard` checks `memberHasFitnessAccess` and routes paid/legacy members directly to Fitness, Budgeting and Life.
- Existing Fitness endpoint: `/api/fitness/chat` has paid membership checks and gated shared usage, including workout-plan mutations.
- Life: `/api/life/chat` relies on `lifeTester` and stores private goals/history.
- Budgeting: `/budgeting/launch` uses its separate signed-in handoff.
- Current PR #251 preview only: `isolatedTrialPreviewEnabled` strictly requires the named preview branch; production never enters the trial routes.
- Paid conversion test: one provider-backed Life message saved and debited once, 199/200 available. Historical trial messages preserved.

## Implemented in PR #251 — NOT RELEASED

- Production-only, fail-closed Clerk/Stripe/Pickaxe/Terms/lifetime enrollment checks.
- $0 trial Terms, verified Clerk sign-up, authenticated trial enrollment, and shared 15-message ledger.
- Three-coach conversational chat and signed-in history viewer, including history after conversion.
- Stripe LIVE-invoice verification and conversion hook preserving the member's trial history.
- Homepage free-trial entry hidden by the public-release gate.

## Remaining release blockers

1. **Eligibility:** derive a normalized verified Clerk email and stable server-only member key. Cross-check the local active/recoverable/legacy membership row **and** historical Stripe **and** Pickaxe. Unknown or failed lookups fail closed. Existing paid or grandfathered members route to the unchanged member dashboard; they never receive a trial. Use the pure `assessPublicTrialAdmission` contract as the policy.
2. **Lifetime persistence:** the migration is drafted but NOT APPLIED to production. Review it against existing rows, secure explicit approval, and stage a rollback before release. One lifetime grant per stable member identity, 15 shared across Fitness, Budgeting, Life. Atomic reserve/settle for each coach; do not reset exhausted grants or accept client-supplied entitlement claims. Existing converted members retain the old chat and saved data.
3. **Coach action parity — BLOCKED:** the drafted trial-chat path provides conversational coaching but is not verified to preserve native Fitness workout validation/saves, Budgeting manual-entry storage, and Life goals. Do not release until the native actions and cross-app access are reviewed and tested. An additional PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED gate now defaults OFF.
4. **Signup and conversion:** after Terms + Clerk verification, admit eligible new users without mandatory Stripe payment. Clearly distinguish trial, billing-required, and paid states. Once payment is verified through Stripe and an approved plan, bind the *same* Clerk account/member key and preserve all history, plans, budgets and goals.
5. **Existing subscribers:** preserve legacy/grandfathered access, current tier balances, pricing, cancellations and upgrade/downgrade behavior. Never infer a fresh allowance from absent wallet records or restart a trial for previously converted accounts.
6. **Security:** isolate test credentials/preview data from production; verify DB branch and subscription mode server-side. Enforce idempotency, retries, ownership, replay protection and provider-timeout reconciliation; confirm terms acceptance remains durable. Run a security review before merging.
7. **Release:** release gate defaults OFF. Keep PR draft while implementing; run tests for new/legacy/exhausted/converted/unknown-membership paths, three-coach shared counter, no duplicated spending, saved history continuity, Stripe webhook reliability, and rollback. Only deploy to production after explicit release approval.

## What counts as complete

No changes to live member accounts while preparing. A public-ready PR with code/tests for all above behaviors, a successful staged rehearsal and verified rollback plan, no unresolved safety gaps, then a **separate** authorization to enable public trial flags. Private QA already completed is not repeated without a concrete regression.

## Public rollout safeguards

The feature is disabled unless every release switch is explicitly enabled: PUBLIC_INTRO_TRIAL_ENABLED, PUBLIC_INTRO_TRIAL_RELEASE_APPROVED, PUBLIC_INTRO_TRIAL_METER_READY, PUBLIC_INTRO_TRIAL_THREE_COACHES_READY, and PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED. Conversion and retained history have separately gated schema readiness. No production environment changes, migrations, or customer billing changes have been made in this PR.

The private test's successful paid-message handoff remains closed and does not need another checkout or test payment. This branch needs automated and staged product-level checks before merge, plus a distinct public-release decision.
