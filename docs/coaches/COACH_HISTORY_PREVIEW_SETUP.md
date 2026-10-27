# Future Coach History: Preview Only

Status: implementation prepared, not activated. Do not apply the schema to production.

1. Review `COACH_HISTORY_DRAFT.sql` and apply to an independently isolated Neon test branch only after explicit database-change approval.
2. Configure `COACH_HISTORY_PREVIEW_DATABASE_URL` and `COACH_HISTORY_PREVIEW_BRANCH_ID` on the restricted preview deployment, without disclosing secret values.
3. Only if explicitly approved, enable `PREVIEW_COACH_HISTORY_ENABLED=true` on the named draft branch. Every query verifies the Neon branch ID; production and other branches fail closed.
4. Use synthetic Clerk member IDs and thread IDs only. Test replay of the same request key, conflicting text under same key, cross-member reads, and same thread ID under another coach.
5. The shared coach turn runner and authenticated member endpoint must be connected to this adapter in an isolated synthetic flow before launch. The adapter does not generate AI or grant any membership.

No existing Fitness, Life, Budgeting or paying-user data is migrated or updated. Career Coach remains unreleased.
