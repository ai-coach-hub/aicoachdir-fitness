# Fitness Coach: Pickaxe MISSING_TIMEZONE and slow-save repair (2026-11-17)

Status: CODE STAGED ON REVIEW BRANCH ONLY. Owner updated and closed the live Pickaxe agent builder on Nov 19, but the Save Action was not changed and no paid verification run occurred. Production database migration, feature-flag activation, or website release have NOT been performed.

## Confirmed diagnosis

Pickaxe support identified session `fitness-chat-qa-post-access-20261112`: the Save Workout Plan action **never ran** because timezone was missing and there was no retrieved plan. The model usage did cost credits. The run took 107 seconds, while the caller had disconnected at 70 seconds.

## What the website code changes

- The member browser sends its IANA timezone with each Fitness chat message.
- The server validates it; an existing saved plan's timezone is fallback; UTC is the final deterministic fallback.
- For plan/schedule/save requests the server explicitly gives the coach that timezone and requires `userTimezone` in the action inputs.
- For saved-plan mutations ONLY, a production-only feature flag enables durable, member-scoped jobs. Job creation is idempotent on the existing request key. Once the quick POST returns, a Vercel `after()` task runs the existing authenticated Fitness chat and save-verification pipeline. A read-only GET polls the finished response.
- The existing driver/poller timeouts expand only for flagged background mutations; no extra AI requests are sent just to check status. A missing/uncertain result is **never** treated as a successful save.
- The browser retains only the request and conversation IDs for read-only resumption on refresh; it does not persist the member's message.

## Pickaxe action and upstream timezone review (November 18)

The owner supplied the 1,460-line original **Save Workout Plan to My Workouts v2** Python action (`ai-coach-action-reliability-v9`). It already normalizes and preserves userTimezone, propagates it to staged future plans, and performs exact save and display-memory readback. The action **does not contain MISSING_TIMEZONE**, and Pickaxe support confirmed the November 12 QA run stopped before that Action ran. **Do not rebuild, replace or republish the Python save Action to solve that pre-action error.**

The repository's **checked-in upstream coach prompt** in `scripts/sync-pickaxe-compact-coach.mjs` expressly instructed the coach to ask the member for a timezone when no saved plan provides one. This is consistent with the support report. PR #256 changes only the source on this draft branch: accept a valid site-provided IANA timezone before asking; when no plan exists, a valid request timezone is sufficient. The owner pasted the complete preserved prompt with the corrected calendar paragraph directly in the Pickaxe builder and clicked Update and close. Its agent overview shows Updated Nov 19; this confirms a saved agent edit, not an end-to-end save test. Do not run the sync script: it would overwrite the preserved competitor-comparison section.

The site's new structured workout/save prompts explain that a browser timezone may be used and that UTC is a fallback scheduling convention, not a verified geographic location. The save prompt always carries this instruction, including for mutation phrasings that do not trigger the structured-workout validation copy.

The existing Python action's 60-second timeout is per outbound request; the previous website's 70-second driver timeout is separate. All source-only checks are non-billable, but they are **not** a live Pickaxe save test.

## Production release gate

1. Review the branch and confirm the correct Vercel Fitness project and intended deployment environment.
2. Obtain explicit production migration approval after verifying branch and backup, then apply `migrations/20261117_fitness_resumable_chat_REVIEW_ONLY.sql` to verified production Fitness Neon only. Migration includes created_at retention index. No table is installed as of last read-only query.
3. Owner confirmed Fluid Compute enabled. The website route declares maxDuration=300. Confirm production plan's runtime entitlement and Next after() before enablement; preserve never-replay behavior for worker failures.
4. Owner published corrected Pickaxe calendar instructions Nov 19 by Update and close; screenshot shows updated date. Preserve prompt and Python Save Action. Do not re-run model just to verify editor state.
5. Confirm green CI on the latest branch commit and preview build. Earlier 684-test success was for an older commit; no paid Pickaxe request is needed for this check.
6. Before activation, configure a cryptographically random CRON_SECRET (>=24 characters) as a Vercel production environment secret; verify daily scheduled route /api/internal/fitness-chat-retention is installed and rejects unauthorized traffic. Approve deployment separately from setting FITNESS_RESUMABLE_CHAT_ENABLED=true. The feature remains off by default.
7. Only after approved release, consider at most one isolated paid end-to-end verification if necessary. Before that, treat production save behavior as unverified.

## Failure and cost safeguards

- Duplicate POSTs with the same request ID return the existing job; they never start another model request.
- Polling uses only authenticated GETs. It can cost normal database/API reads but **not additional Pickaxe model generations**.
- A crashed worker is reported as uncertain after eight minutes and is not restarted automatically.
- A successful response requires the existing Pickaxe Save Workout Plan Action receipt and read-back consistency.
- An uncertain result tells members to check My Workouts/history before making another request. Quota settling remains in the existing Fitness pipeline.
- A daily Vercel Cron Job at 04:00 UTC calls authenticated GET /api/internal/fitness-chat-retention using CRON_SECRET. The route requires the production environment, enabled feature, valid bearer secret, and hard-coded production Neon branch ID; it deletes only fitness_chat_jobs rows created over seven days ago, with a 5,000-row per-run limit. It never touches workout plans/history/membership tables and never invokes Pickaxe. Keep the CRON_SECRET secret; missing/short secret rejects all requests. Monitor deletion counts/backlog and 503 responses; effective deletion is within seven days plus cron interval when healthy and below the daily batch limit.
- Deleting old request keys means the same key will no longer deduplicate after seven days; browser resume after retention expiry must say result is unavailable and NEVER automatically resubmit. Retention is not yet active until database migration, production deployment and secret/feature approval.
