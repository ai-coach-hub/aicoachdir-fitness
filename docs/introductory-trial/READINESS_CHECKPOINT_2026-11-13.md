# Introductory trial — release-readiness checkpoint (2026-11-13)

**Decision: NO-GO for public launch.** This is a documentation-only audit on draft PR #251. It is NOT a production migration, release approval, or authorization to run more provider requests. The coordinated Budgeting work remains in draft PR #18.

## Verified and closed — do not repeat

| Item | Evidence | Status |
| --- | --- | --- |
| Trial conversation history for Fitness, Budgeting, Life and converted account | PR #251's isolated branch verification, three prior trial turns and one paid continuation retained | PASS, private QA |
| Trial-to-paid Stripe TEST conversion and one paid Life response/ledger debit | PR #251, recorded signed test invoice and matching member ledger | PASS, private QA, not a live Stripe production flow |
| Native Life goal save and readback | PR #251, isolated Neon readback | PASS, private QA |
| Native Budgeting manual expense save and reopen | Budgeting PR #18; isolated branch `br-spring-cloud-aui2mogd`, one $1 expense in December 2099 | PASS, private QA |
| Provider registration/access-group and Fitness API deployment existence | PR #251's read-only diagnostics; access group assigned, API deployment found | PASS for identification only; **not** evidence of a workout save |
| Fitness native workout save/readback | One provider HTTP 404, no confirmed Action run; request `native-fitness-save-qa-20261107` held `uncertain` | **BLOCKED**; never auto-retry, release, or settle |

The separate live-site Life Coach launch is not part of the free-trial rollout. Do not reclassify launched Life Coach as Coming Soon because a private preview has no provider authorization.

## Read-only inventory reviewed 2026-11-13

- GitHub: hub PR #251 and Budgeting PR #18 both OPEN, DRAFT, unmerged.
- Vercel: most recent hub trial preview deployment `dpl_7ZNskWY16iptLRWqPLtXCLCX2gzs` READY at hub PR #251 head `5fbf1107`; Budgeting `dpl_5aHxrqoX1iAbS6fmEryHXH3ikTc9` READY at PR #18 head `38b8ce3`. READY means a build exists, not that production readiness is certified.
- Vercel environment variable names/scopes (no values decrypted): none of the five public release keys were listed on either project. This is a configuration inventory, not a live behavior test. Do not create/enable keys without explicit launch approval.
- Neon: isolated branch `br-spring-cloud-aui2mogd` and primary branch `br-sparkling-glitter-aucpz59d` both listed as ready. This is **not** proof that trial migration tables exist on the primary branch. PR documentation previously reported production trial tables absent; verify schema read-only again immediately before migration approval.
- Stripe: connected Stripe account inventory was not accessible during this audit. No production billing/webhook configuration is certified here.

## Gates that remain blocked before a public rollout

1. **Pickaxe Fitness action**: obtain provider explanation of the completion-route HTTP 404 and credential/deployment compatibility; reconcile original uncertain request using provider + isolated ledger evidence **without generating a new model call**. Only after an authorized plan should a distinct one-time real Fitness save/readback be attempted. Must prove validator, saved plan, dates/history and conversion continuity.
2. **Native three-coach parity**: existing trial conversational chat blocks certain saved-work mutations instead of performing them. Native Life goal and Budgeting expense *individual* QA passes do NOT prove the public trial entitlement path, shared-message metering, and conversion continuity for all three coaches. Complete cross-repo authenticated trial-handoff/owner checks, native Fitness/ Budgeting / Life action routing and end-to-end coverage.
3. **Security review**: verified Clerk primary identity; legacy/paid/previously-subscribed exclusions; Terms acceptance; one lifetime grant; HMAC handoff expiry/replay; cross-member isolation; provider timeout/uncertain reservations; rate limiting; input/route permissions; no paid cookies issued to trial users; no additional usage beyond 15.
4. **Billing review**: verify live Stripe checkout and signed paid-invoice webhook conversion under the **same** member identity; preserve existing subscriber prices, plans, message wallets, renewal schedules, grandfathered access, cancellation behavior, and saved records. Do not repeat prior TEST checkout just for this audit.
5. **Schema rollout**: inspect unapplied additive production migration and production branch ID; take/review backup and rollback plan; obtain explicit production migration authorization. Rollback must not drop usage/history tables or silently regrant trials.
6. **Coordinated release**: tests and reviews must pass on **the exact coordinated hub and Budgeting commits**; stage authentic end-to-end acceptance for new, existing, exhausted and converted members; explicitly approve rollout separately from code merge. Do not assume a READY preview is sufficient.

## Launch switch discipline

Keep all public gates OFF/unconfigured:
- `PUBLIC_INTRO_TRIAL_ENABLED`
- `PUBLIC_INTRO_TRIAL_RELEASE_APPROVED`
- `PUBLIC_INTRO_TRIAL_METER_READY`
- `PUBLIC_INTRO_TRIAL_THREE_COACHES_READY`
- `PUBLIC_INTRO_TRIAL_COACH_ACTIONS_REVIEWED`

Also separately review `PUBLIC_INTRO_TRIAL_SCHEMA_READY` and `PUBLIC_INTRO_TRIAL_CONVERSION_ENABLED`; never disable history readability just to pause new enrollment. Refer to `ROLLBACK_AND_RELEASE.md` and `PUBLIC_RELEASE_PLAN.md`.

## Safe next actions, in order

1. While Pickaxe support is pending, conduct read-only code and production-schema preflight, cross-repo contract review, billing/security checklist and deterministic isolated mock tests. Any identified code changes stay in the draft branches.
2. Reconcile Pickaxe provider result and the original `uncertain` Fitness reservation; no more test clicks or automatic retries.
3. Once approved, run the minimal **newly required** authenticated end-to-end checks, retaining earlier successful evidence rather than restarting the entire test process.
4. Secure explicit separate approvals for production migration, PR merge, and public trial activation.

**No-go remains in force until every blocking check is independently evidenced.**
