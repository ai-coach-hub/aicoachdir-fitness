# Production-derived trial migration rehearsal — 2026-11-13

**Verdict: PASS (database migration and deterministic ledger behavior). NOT a public-launch approval.**

## Isolation and exact migration

- Neon project `empty-base-81267482`; production branch `br-sparkling-glitter-aucpz59d` was **read-only** throughout this rehearsal.
- Fresh production-derived branch `qa-intro-trial-migration-rehearsal-20261113` / `br-small-salad-ausuetdk`, parent `br-sparkling-glitter-aucpz59d`, produced from current production state.
- Applied **the exact SQL statements** from `migrations/20261103_public_introductory_trial_DRAFT.sql` on the rehearsal branch, in one Neon transaction. The SQL parser kept each complete dollar-quoted PL/pgSQL body intact; outer BEGIN/COMMIT were supplied by the transaction API.
- Three tables present: `introductory_trial_grants`, `introductory_trial_requests`, `introductory_trial_history`.
- Three functions present: `intro_trial_reserve`, `intro_trial_settle`, `intro_trial_reconcile`.
- PUBLIC function EXECUTE privilege: **false** for all three. Confirm app database role and operator-only privileges in production-configuration review.
- No trial tables/functions were added to production. This was a **real isolated migration**, not a dry-run-only inspection.
- The migration rehearsal branch remains isolated for review; no Vercel project is pointed to it.

## Existing paid data preservation

| Item | Production | Rehearsal |
| --- | --- | --- |
| Paid membership row count | 7 | 7 |
| Existing shared-usage tables | 2 | 2 |
| MD5 of existing non-trial table/column metadata | `378dfcdd765758e040cf14f45f653c44` | `378dfcdd765758e040cf14f45f653c44` |
| New trial tables | 0 | 3 |

The digest is a structural comparison, not a check of every customer value. No existing paid membership rows were changed by the test statements.

## Synthetic SQL ledger results

All cases used generated fake Clerk IDs and fake `member_` keys, plus synthetic messages. No LLMs, Pickaxe completions, Stripe payments, emails, or customer-facing routes were invoked.

- PASS: exactly 15 reservations across Fitness/Budgeting/Life, 16th rejected as `exhausted`.
- PASS: same request key repeats as `duplicate_reserved`; request key with different coach gives `replay_conflict`; missing grant `not_entitled`.
- PASS: completing without durable history gives `history_missing`; after saved history, completion succeeds once; repeated settlement `already_completed`.
- PASS: uncertain settlement holds reservation; no-history reconciliation to completed is rejected; explicit release restores availability once; duplicate release is rejected.
- PASS: converted account receives no fresh reservation.
- PASS: separate fixture created and completed all 15 requests (five for each coach). Final `completed_uses=15`, `reserved_uses=0`; next request `exhausted`.
- PASS: operator reconcile from uncertain to completed required saved history, succeeded exactly once, then returned `already_completed`. Final balance `completed_uses=1`, `reserved_uses=0`.
- PASS: paid membership row count and existing non-trial schema matched the current production branch after rehearsal.

These prove sequential SQL contract behavior, not true concurrent-request race handling or full browser-to-Pickaxe-to-database integration. The generated QA records remain only on the disposable rehearsal branch.

## Other integration review based on current draft source

- Hub trial enrollment requires verified Clerk primary email, same-origin/no client-supplied enrollment body, production branch identity, Terms confirmation, historical Stripe + Pickaxe access verification, a stable signed member key, and exhaustion/converted exclusion. Historical source lookups fail closed on incomplete responses. This is a static code review, not a real provider-credential test.
- Budgeting draft tests cover signed short-lived HMAC handoff, tamper/expiry rejection, per-member native request checks, no trial-to-paid-cookie escalation, and existing paid member precedence. This is source/test evidence, not a complete authenticated production-like end-to-end execution.
- Live Stripe invoice webhook conversion, a three-coach browser-to-API-to-native-saved-data run, and true concurrent/timeout behavior remain unverified. Existing isolated Budgeting expense save, Life goal readback, and Stripe TEST conversion successes remain valid and need not be repeated without a concrete change.
- Native Fitness save remains blocked on Pickaxe provider evidence. The three historical uncertain QA requests must not be replayed or changed.

## Remaining release gates

1. Confirm server application role has ONLY required reserve/settle privileges and operator-only reconcile is inaccessible from customer routes.
2. Review and test concurrent reserve/settle/duplicate behavior and HMAC replay protection on a production-like, isolated deployment without sending provider calls.
3. Verify actual signed-in cross-repo Budgeting trial owner and saved-data handoff, plus Life goal and Fitness workout action parity (Pickaxe issue still outstanding).
4. Verify Stripe LIVE signed webhook and existing plan/legacy member continuity without charging a customer; validate prod configuration and restore plan separately.
5. Review app branches, complete CI and exact-commit tests, obtain distinct approvals for production schema migration and for public feature flags. Never treat migration success as release permission.

**NO-GO for public free-trial launch. No production schema writes, AI messages, payments, Gmail access, or live member changes.**
