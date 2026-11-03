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

## Required production integration (not yet implemented)

1. **Eligibility:** derive a normalized verified Clerk email and stable server-only member key. Cross-check the local active/recoverable/legacy membership row **and** historical Stripe **and** Pickaxe. Unknown or failed lookups fail closed. Existing paid or grandfathered members route to the unchanged member dashboard; they never receive a trial. Use the pure `assessPublicTrialAdmission` contract as the policy.
2. **Lifetime persistence:** add a production migration reviewed against existing rows. One lifetime grant per stable member identity, 15 shared across Fitness, Budgeting, Life. Atomic reserve/settle for each coach; do not reset exhausted grants or accept client-supplied entitlement claims. Existing converted members retain the old chat and saved data.
3. **Coach integration:** respect each coach's existing memory, saved tools, actions and guardrails. Do not substitute the minimalist preview API handler for production Fitness workout actions, Budgeting storage, or Life goals. Securely enforce trial usage *before* the model, then settle only on successful persisted response.
4. **Signup and conversion:** after Terms + Clerk verification, admit eligible new users without mandatory Stripe payment. Clearly distinguish trial, billing-required, and paid states. Once payment is verified through Stripe and an approved plan, bind the *same* Clerk account/member key and preserve all history, plans, budgets and goals.
5. **Existing subscribers:** preserve legacy/grandfathered access, current tier balances, pricing, cancellations and upgrade/downgrade behavior. Never infer a fresh allowance from absent wallet records or restart a trial for previously converted accounts.
6. **Security:** isolate test credentials/preview data from production; verify DB branch and subscription mode server-side. Enforce idempotency, retries, ownership, replay protection and provider-timeout reconciliation; confirm terms acceptance remains durable. Run a security review before merging.
7. **Release:** release gate defaults OFF. Keep PR draft while implementing; run tests for new/legacy/exhausted/converted/unknown-membership paths, three-coach shared counter, no duplicated spending, saved history continuity, Stripe webhook reliability, and rollback. Only deploy to production after explicit release approval.

## What counts as complete

No changes to live member accounts while preparing. A public-ready PR with code/tests for all above behaviors, a successful staged rehearsal and verified rollback plan, no unresolved safety gaps, then a **separate** authorization to enable public trial flags. Private QA already completed is not repeated without a concrete regression.
