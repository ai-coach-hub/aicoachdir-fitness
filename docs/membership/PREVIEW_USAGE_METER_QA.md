# Preview shared usage meter: integration QA

Date: 2026-10-18/19. Scope: Neon project `empty-base-81267482`, non-primary branch `br-autumn-breeze-auw38rgr` (`preview/life-coach-private-20261012`). No production writes, Stripe calls or provider inference. Synthetic `qa-meter-20261019-*` records remain in preview.

## Verified against installed SQL functions

- Reserve Fitness for member A: `reserved`.
- Replay same request key: `duplicate_reserved`, no second charge.
- Reserve Budgeting for A: `reserved`.
- Third request when two reservations used: `exhausted`.
- Member B independent allowance: `reserved`.
- Settle A Fitness: `completed`, retry: `already_completed`.
- Settle failed A Budgeting: `released`; now A Life can reserve: `reserved`.
- Settle B as unknown model outcome: `uncertain`; cap stays occupied; Career request: `exhausted`.
- Reconcile B unknown request as failed: `released`; new Career request: `reserved`.
- Nonexistent earlier period: `ineligible`.
- Member C 3 concurrent reservations with monthly cap 1: exactly one `reserved`, two `exhausted`; counts remain reserved=1, completed=0.
- A November period created with no use; attempted November reservation before Nov 1: `ineligible` (future-period boundary). Actual rollover on a later date has not yet been tested.

## Important safeguards / remaining blockers

- This is database-level QA, not verified live coach routing. Fitness and Budgeting still have provider/portal pathways; do not claim sitewide enforcement yet.
- Test rows are synthetic and deliberately limited to preview. No cleanup migration or production changes.
- Vercel Preview `LIFE_COACH_DATABASE_URL` is branch-scoped in configuration, but its underlying connection string has not yet been conclusively matched to the Neon branch. Verify before enabling API integration.
- Existing $15/400 access is unchanged; do not derive a paid customer's allowance from client input.
- No production metering, entitlements or Stripe changes are authorized.
- Follow-up: add automated regression tests covering all SQL function states and cross-coach cap, verify meter-on-API authentication/idempotency, ensure member-visible AI uses vs provider-call cost accounting, and stage preview-only integration for approval.
