# Public introductory trial — rollback / incident readiness

## Immediately reversible gates

The public trial is OFF by default. To stop all new trial admissions and model calls: unset `PUBLIC_INTRO_TRIAL_ENABLED` or `PUBLIC_INTRO_TRIAL_RELEASE_APPROVED`. New public trial routes return 404, while existing paid and grandfathered routes remain untouched.

Do **not** unset `PUBLIC_INTRO_TRIAL_SCHEMA_READY` solely to pause enrollment: that switch also gates reading saved trial history after conversion. Keep history readable through independently verified Clerk identity and member key. Disable enrollment/model access instead.

The production migration (currently DRAFT) contains only additive `introductory_trial_*` tables and functions. Never drop or truncate these tables during rollback: doing so loses saved messages and lifetime use history and would allow repeat trials.

## Dependency failure handling

- Stripe, Clerk, Pickaxe, Terms, or Neon lookup uncertain: fail closed, no trial grant or paid charge.
- Model request times out or storage fails after model may have started: keep a reserved/uncertain debit and reconcile based on authoritative provider + saved history evidence; never automatically refund or retry with a new ID.
- Completed response exists in trial history: the request may only settle `completed` if history belongs to that same Clerk ID, coach and request.
- Customer finishes Stripe payment but closes checkout page: the signed live Stripe webhook must independently verify paid invoice, match member and then mark the existing trial converted. Preserve all history.
- Budgeting service disconnected: never turn a trial cookie into a paid cookie or reuse a paid member's data.

## Preflight checklist

- [ ] PR #251 and coordinated Budgeting PR reviewed, no open security or native-action issues
- [ ] Migration reviewed, backup/restore plan documented, production branch ID verified
- [ ] Per-coach action save/readback and paid conversion continuity passed in isolation
- [ ] Price catalog, billing webhooks and grandfathered memberships unchanged
- [ ] Public availability toggles reviewed and consciously enabled after explicit approval
- [ ] Operator knows how to disable admission without deleting saved data
