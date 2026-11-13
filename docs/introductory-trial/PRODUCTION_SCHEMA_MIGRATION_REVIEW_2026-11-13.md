# Trial schema: production migration preflight (2026-11-13)

**Decision: SCHEMA MIGRATION NOT YET APPROVED. NO PRODUCTION WRITE MADE.**

## Evidence collected (read-only)
- Verified production Neon branch `br-sparkling-glitter-aucpz59d`: **zero** `public.introductory_trial_%` tables; **zero** `public.intro_trial_%` functions. Existing paid `public.fitness_memberships` columns were inspected, not modified.
- Isolated QA branch `br-spring-cloud-aui2mogd`: three trial tables (`grants`, `requests`, `history`) and **two** functions (`intro_trial_reserve`, `intro_trial_settle`).
- DRAFT migration `migrations/20261103_public_introductory_trial_DRAFT.sql` defines the three trial tables **and three functions**, including `intro_trial_reconcile`. Therefore the isolated QA schema does **not** match the entire proposed production migration; previous isolated trial tests cannot be claimed as a rehearsal of the operator-only reconciliation routine.
- The migration is additive with respect to existing paid membership and shared-wallet tables in its current text. It uses `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE FUNCTION`. The latter can replace an existing function if the schema were not empty, so inspect signatures immediately before execution.
- The draft contains a transaction and an operator-only reconciliation function, and revokes PUBLIC execution privileges on trial functions. Before approval confirm the intended app role retains appropriate execution permissions and no client role receives operator reconcile rights.

## Required migration rehearsal (not performed)
1. Confirm the current production branch and take a recoverable backup/snapshot or restore point; do not use the existing converted-trial QA branch as the rehearsal target.
2. Create a fresh **production-derived** rehearsal branch, with suitable access controls, and verify it points at the intended project. No customer-facing Vercel environment variables should reference it.
3. Run the **exact reviewed migration** on the rehearsal branch using a direct/unpooled migration connection, and confirm the resulting constraints, indexes, function signatures, ownership and grants.
4. Exercise deterministic SQL-only transaction cases that roll back without lasting data or AI calls: 15 allocations across coaches, 16th rejected, identical-request replay, cross-coach replay conflict, no-grant denial, completed requires history, uncertain keeps reservation, operator-only reconcile after documented evidence, converted member denied new allowance.
5. Verify pre-existing paid membership counts and shared-wallet schema remain unchanged. Inspect rollback strategy: disable public trial enrollment gates, preserve lifetime grant/history tables, never drop or reset them.
6. Obtain separate migration approval before applying on production. Applying schema is **not** permission to activate public trial, run Pickaxe completions, create subscriptions, or merge release PRs.

## Non-schema release gates still open
- Native Fitness save/readback blocked on the three uncertain Pickaxe test attempts (404, 500, no recorded HTTP response); no retries.
- Authenticated three-coach trial action parity and budget handoff across the two repos, live webhook/conversion security review, and trial-to-paid preserved-work continuity need final verified evidence. Earlier isolated Budgeting/Life/Stripe TEST successes are retained and need not be repeated without cause.
- Production release flags remain unconfigured; hub PR #251 and Budgeting PR #18 remain separate drafts.
- Final test needs to explicitly prove no existing/grandfathered user can receive a new trial and no repeat trial for a previously converted/exhausted identity.

## Ready-to-run non-mutating inventory
See `sql/public-introductory-trial-production-preflight-readonly.sql`. Re-run only its SELECT statements immediately before a separately authorized migration; capture branch ID and counts, not customer records.

**No secrets, member PII, email access, model requests, Stripe actions or production database writes are required for this review.**
