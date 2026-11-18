# Fitness Coach: Pickaxe MISSING_TIMEZONE and slow-save repair (2026-11-17)

Status: CODE STAGED ON REVIEW BRANCH ONLY. No new Pickaxe test, production migration, feature-flag change, or release has been performed.

## Confirmed diagnosis

Pickaxe support identified session `fitness-chat-qa-post-access-20261112`: the Save Workout Plan action **never ran** because timezone was missing and there was no retrieved plan. The model usage did cost credits. The run took 107 seconds, while the caller had disconnected at 70 seconds.

## What the website code changes

- The member browser sends its IANA timezone with each Fitness chat message.
- The server validates it; an existing saved plan's timezone is fallback; UTC is the final deterministic fallback.
- For plan/schedule/save requests the server explicitly gives the coach that timezone and requires `userTimezone` in the action inputs.
- For saved-plan mutations ONLY, a production-only feature flag enables durable, member-scoped jobs. Job creation is idempotent on the existing request key. Once the quick POST returns, a Vercel `after()` task runs the existing authenticated Fitness chat and save-verification pipeline. A read-only GET polls the finished response.
- The existing driver/poller timeouts expand only for flagged background mutations; no extra AI requests are sent just to check status. A missing/uncertain result is **never** treated as a successful save.
- The browser retains only the request and conversation IDs for read-only resumption on refresh; it does not persist the member's message.

## Pickaxe action configuration STILL needs a separate review

Pickaxe's **Save Workout Plan** action code executes in Pickaxe, not in this GitHub repository. This PR cannot change that externally managed code. Locate the Save Workout Plan action ID `ACTIONNYM6UU9XWNX8PQTF79PV` inside the Fitness Coach deployment and inspect its timezone handling. It should:
1. Accept the plan's `userTimezone` (validated IANA name). Prefer verified action input, then an already-stored plan timezone, then `UTC` as the final fallback.
2. Compute local dates with that timezone rather than the server's default locale. If input was inferred as UTC, avoid claiming this is the member's geographic timezone.
3. Never block an otherwise valid save with `MISSING_TIMEZONE` when a valid fallback is available.
4. Preserve existing `Get Workout Plan`, `Save Workout Plan` receipt semantics, member isolation, current/next-week protection, and final read-back verification.

Because we lack a connected Pickaxe editor, the externally managed action was **not** modified. Do not mark an end-to-end save test as passing solely from these website changes.

## Production release gate

1. Review the branch and confirm the correct Vercel Fitness project and intended deployment environment.
2. Review and apply `migrations/20261117_fitness_resumable_chat_REVIEW_ONLY.sql` to the verified **production Fitness** Neon branch (not preview). The code refuses the wrong branch.
3. Confirm the plan supports the required `maxDuration = 300` execution and `after()` task duration; verify Vercel's runtime and deployment settings.
4. Confirm the Pickaxe Save Workout Plan action's timezone fallback as above.
5. Review GitHub CI (offline tests and TypeScript) and run preview/UI validation without submitting an AI request. Verify no Stripe, pricing, or grandfathering changes.
6. Only after deliberate approval, deploy the reviewed commit and set `FITNESS_RESUMABLE_CHAT_ENABLED=true` on production. If this flag is absent or false, existing Fitness behavior remains, except that a verified timezone is forwarded with requests.
7. Do one explicitly approved, isolated end-to-end save test at most, measuring costs. Do not reuse real member data for QA. Until then label save behavior **unverified**.

## Failure and cost safeguards

- Duplicate POSTs with the same request ID return the existing job; they never start another model request.
- Polling uses only authenticated GETs. It can cost normal database/API reads but **not additional Pickaxe model generations**.
- A crashed worker is reported as uncertain after eight minutes and is not restarted automatically.
- A successful response requires the existing Pickaxe Save Workout Plan Action receipt and read-back consistency.
- An uncertain result tells members to check My Workouts/history before making another request. Quota settling remains in the existing Fitness pipeline.
- Treat stored job output as private member data; plan and implement reviewed short retention before enabling. The initial schema intentionally does not auto-delete in-flight requests.
