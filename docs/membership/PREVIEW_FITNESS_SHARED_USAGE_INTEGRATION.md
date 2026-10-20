# Fitness shared AI-usage integration — preview-only safety contract

Status: architecture review complete; Fitness endpoint **not yet metered**. Do not imply this document enables it.

## Existing implementation verified
- `app/api/fitness/chat/route.ts` authenticates Clerk member and invokes `memberHasFitnessAccess` first.
- `POST` handles both chat/model requests and `complete_workout` / `sync_completed_workout` actions.
- Model generation is not one simple `fetch`: normal replies, saved-plan mutation drivers and optional quality rewrites can invoke Pickaxe.
- Budgeting currently uses its own Vercel application, with an authenticated membership handoff from Fitness.
- The private three-use Life Coach meter is wired to Neon branch `br-autumn-breeze-auw38rgr`; its prior QA completed with three confirmed uses and zero pending reservations.

## Non-negotiable boundaries
1. Apply all new metering only to `VERCEL_ENV=preview`, exact branch `feature/life-coach-agent-sandbox-20261011`, explicit `PREVIEW_SHARED_USAGE_METER_ENABLED=true`, verified tester, and opt-in enrollment in the **nonproduction** Neon branch. No live subscription records or real Stripe mutations.
2. Authenticate Clerk and verify Fitness access before reserving usage. Use server-derived member ID, period, entitlement and coach. No trusting client-provided membership or use count.
3. Skip read-only GET and non-AI `complete_workout` / `sync_completed_workout` actions. Test model-backed plan mutations independently; never skip a paid model call by misclassifying a chat input as read-only.
4. Reserve atomically **before** the first potential Pickaxe model request. A single user request that triggers an internal quality rewrite still consumes one user-visible request allowance; track provider activity separately to assess actual cost.
5. For a verified completion, settle `completed`; for conclusively pre-provider/no-model exits, release; for provider timeout, unconfirmed save, or ambiguous result, retain `uncertain` until reconciliation. Do not silently release after a possible charge.
6. Use a stable request key across client retries; duplicate requests must not run Pickaxe again. Never mint a fresh request key on every retry in the API wrapper.
7. Fail closed when metering is enabled for an enrolled preview tester but the meter cannot reserve. Never silently fall back to unlimited generation.
8. Ensure ordinary Fitness users not explicitly enrolled are unaffected, including members on the existing $15/400-use subscription. Preview mode must not write its synthetic usage data to the production membership DB.
9. Preserve workout read-back, confirmed mutation and safety validation semantics. Do not rewrite the 3,000+-line Fitness endpoint wholesale.

## Required verification before any preview activation
- Existing Fitness route regression tests and TypeScript build pass.
- Authenticated/enrolled member, unenrolled member, signed-out member and branch/env guard tests.
- Same synthetic user calls Life then Fitness: shared 3-use cap; cross-coach aggregate cannot exceed three even under concurrency.
- Identical request key retry: no extra model call and no second charge.
- `complete_workout` / `sync_completed_workout` do not charge.
- Plan create/modify/save success; failed validation; quality rewrite; provider timeout; ambiguous action receipt are reconciled correctly.
- Member isolation across two accounts; exhausted allocation blocks chat but leaves read-only operations available.
- Explicit nonproduction Neon branch-id check; preview deploy and production isolation verification.

## Follow-on
Fitness route implementation and tests, then Budgeting separate-app secure server-to-server meter exchange. Both must pass private preview QA before any production approval. Pricing tiers are a separate decision.
