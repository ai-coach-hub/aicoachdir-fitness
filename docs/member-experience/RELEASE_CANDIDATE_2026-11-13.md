# Member-experience release candidate — November 13, 2026

**Status: READY FOR VISUAL ACCEPTANCE, NOT APPROVED FOR PRODUCTION.** This note belongs to draft PR #252. Do not merge, deploy to production, switch release flags, or promote a preview on the basis of this document.

## Exact candidate and baseline

- Repository: `ai-coach-hub/aicoachdir-fitness`
- Candidate branch: `feature/fitness-return-experience-20261108`
- Candidate commit: `6eee148ef33a77c47f28c4d8b93f4327cc2134bb`
- PR: https://github.com/ai-coach-hub/aicoachdir-fitness/pull/252 (open, draft, mergeable/clean at read-only inspection)
- Current production baseline: `67c02644f243d71093de52e277932b58e902f369` from Vercel production deployment `dpl_HZLMRttnmywrs3DZabWXe7QkwdpZ`
- Candidate preview: `https://aicoachdir-fitness-20npo4ss4-kcb3.vercel.app`, deployment `dpl_6jBg9Mdz6JepsFw7Qb2yMua7WGw5` READY
- CI `#1117` SUCCESS on candidate SHA (regressions plus type-check)

## Actual change scope (12 files)

1. Member dashboard: quick links to Fitness chat, saved workouts, Budgeting Coach, saved budget, and Life Coach only for eligible members.
2. Fitness view: deduplicated current saved schedule progress, next uncompleted scheduled workout shortcut, Budgeting Coach and My Budget navigation; uses existing saved plan/history in memory.
3. Life Coach page: production-only links back to dashboard, Fitness and Budgeting; existing Life access gate remains enforced.
4. Homepage: only the exact Fitness preview branch showcases previously launched Life Coach and sends visitors to the live site's member login. No preview Life entitlement; production Life status continues using its existing release gate. Career remains Coming Soon.
5. Supporting styling and regression assertions; no migration or trial/billing code changed.

## Release acceptance checks — do not mark as passed solely from CI

- [ ] Visual inspection of homepage at candidate preview: Life Coach visible as launched, links to live site not preview Life, Career shown only as upcoming, correct mobile layout.
- [ ] Signed-in member dashboard: all quick links legible at mobile and desktop widths; Life link only for entitled member; no duplicate My Goals link.
- [ ] Fitness saved plan: current week's dates correctly match saved schedule; duplicates and rest days excluded, complete count accurate; next scheduled workout opens correct saved workout; existing next-week schedule unaffected.
- [ ] Budgeting Coach / My Budget links resolve through unchanged signed membership handoff, never bypass access.
- [ ] Life Coach remains accessible to members who had it before the change, and ineligible users never gain preview/production access.
- [ ] No change to message balances, subscription pricing, Terms acceptance, cancellation, existing saved data, or paid/grandfathered membership access.
- [ ] Exact candidate commit has green CI and Vercel READY after any further edits; reconfirm production baseline has not advanced.

## Deployment and rollback boundaries

The preview is not an approved production build. Before release, obtain explicit visual acceptance and production authorization, perform a staging/production-configuration review, then merge the specific reviewed PR and inspect the resulting production build; confirm real domain links and authenticated membership behavior. Roll back through the prior known-good production deployment only if needed and only after reviewing Vercel rollback effects (automatic alias assignment behavior may change).

Do not merge trial PR #251 or Budgeting trial PR #18 with this release; no trial schema changes or public trial switches are authorized. Do not run a new Pickaxe workout-save test. The three uncertain isolated Fitness requests remain held for provider reconciliation. No email connector access is necessary.

## Current decision

- **Automated checks:** PASS.
- **Preview build:** READY.
- **Human visual acceptance:** NOT YET CONFIRMED.
- **Authenticated production-like smoke checks:** NOT YET CONFIRMED.
- **Production release:** NOT AUTHORIZED.
