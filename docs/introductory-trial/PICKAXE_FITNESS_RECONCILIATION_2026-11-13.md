# Pickaxe native Fitness save: read-only reconciliation and provider escalation

**Status: BLOCKED / NO RETRY.** Updated 2026-11-13 using the existing draft trial branch and read-only isolated Neon SQL. This is not a new Pickaxe test or a provider-side confirmation.

## Facts independently observed

The three isolated `shared_ai_usage_requests` Fitness QA entries remain `uncertain`:

| Request ID | Created (UTC) | Saved diagnostic |
| --- | --- | --- |
| `native-fitness-save-qa-20261107` | 2026-11-08 01:15:23 | Historical Vercel logs/PR #251 report completion HTTP 404, zero Action runs; no row in the newer diagnostic table |
| `native-fitness-post-registration-qa-20261110` | 2026-11-11 04:31:23 | `http_status=500`, `classification=unclassified_http_failure` |
| `native-fitness-post-access-qa-20261112` | 2026-11-12 22:39:36 | `http_status=NULL`, `classification=not_received` (no HTTP status recorded; NOT evidence that zero model computation occurred) |

- Read-only Neon query on branch `br-spring-cloud-aui2mogd` confirmed **3 uncertain / 3 Fitness native verification requests**.
- `workout_plan_cache` has **no saved row** for the dedicated trial account. This is only one readback source; it cannot alone prove no provider-side save occurred.
- PR #251's existing read-only Studio checks reported registered test identity, Fitness group assignment, configured deployment found, and API deployment type. That means absence of a deployment or access group cannot be assumed as the sole cause.
- The native mutation driver selects `PICKAXE_FITNESS_COACH_DEPLOYMENT_ID` before other fallback credential env keys and POSTs to `https://api.pickaxe.co/v1/completions` with bearer deployment key, message, userId, conversationId, and `stream:false`. The Studio metadata check uses a separate workspace bearer token. Studio metadata authorization **does not prove** that the deployment credential is valid for the completion endpoint.
- The driver accepts saved-work success only from validated Action delivery and independent readback; text response alone cannot certify a workout save.

## Required provider clarification

1. Confirm the currently supported completion endpoint, method, request-body fields, and whether this deployment ID is the correct **bearer credential**. Distinguish a deployment identifier from a deployment token.
2. For the three existing timestamps, inspect provider-side request/Action logs using supplied sanitized request IDs and timestamps. Confirm whether any model run or saved-work Action executed, especially when the client had no HTTP status.
3. Explain the historical 404, subsequent 500, and no-status third attempt, and whether the recent Fitness group assignment changes eligibility for completions.
4. Provide a documented, **non-billable read-only** way to verify deployment/credential compatibility, if available, before recommending any new model call.
5. Confirm whether a failed or timed-out call could consume usage despite no validated saved plan.

## Local next steps (without provider calls)

- Keep all three wallet reservations **uncertain** until authoritative usage and Action evidence resolves them. Do not reset, credit, retry, or create a replacement account or request key.
- Review the selection of `PICKAXE_FITNESS_COACH_DEPLOYMENT_ID` versus `PICKAXE_FITNESS_DEPLOYMENT_TOKEN`, using only secret **names/scopes**, not token values; a change in selection requires documented Pickaxe guidance and separate approval.
- Once Pickaxe supplies evidence, reconcile each request deterministically against the isolated wallet, provider usage, and saved workout store. If evidence remains ambiguous, continue the hold.
- After a verified provider fix, decide separately whether **one** further isolated native-action/save/readback verification is necessary and safe; keep public trial OFF.
- Do not replay the already-passed native Budgeting expense, Life goal or TEST conversion checks.

## Release invariant

Keep hub PR #251 and Budgeting PR #18 draft, production trial schema unapplied, public flags off, and current paying/grandfathered memberships untouched. No model calls, access-group mutations, subscription writes, or production database writes were made for this reconciliation.
