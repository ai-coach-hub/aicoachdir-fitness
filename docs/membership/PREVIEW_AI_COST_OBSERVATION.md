# Private AI cost observation — draft

This change is **off by default** and only logs on Vercel preview when `PREVIEW_PROVIDER_COST_OBSERVATION=true`. It never changes the production member quota, payment, membership, agent prompts, or Pickaxe configuration.

## Coverage
- Fitness Coach: main Pickaxe completion, workout-save driver, and optional quality rewrite (each upstream call reported individually).
- Life Coach: Pickaxe completion (one direct call for an AI-generated Life answer).
- Budgeting Coach: **not yet instrumented**; it is served by an independent application/handoff. This implementation must not be described as all-coach coverage.
- Pure saved-history answers and no-model paths do not emit billed call observations.

## Privacy & accuracy
Only logs `coach`, `providerCalls:1`, `costUsd`, `inputTokens`, `outputTokens`, `source`. No member IDs, email, prompts, response text, conversation/session IDs, API credentials or request IDs. At this stage each log is *one provider call*, **not** a complete member-message cost record. Correlation and one-message multiple-call aggregation remain a follow-up requirement before pricing decisions.

The parser reads only explicit `*_cost_usd` and `usage.input_tokens/output_tokens` fields. Missing metadata returns `null`; tokens and billing cost are **not** estimated from character lengths. **A $0 cost is not inferred from missing cost metadata.** Confirm the actual Pickaxe response schema before relying on numbers.

## Verification / rollout
1. Check the preview build compiles without enabling the flag.
2. Test parser against sample payloads with known fields and missing metadata, ensuring no PII appears in logs.
3. If authorized, enable the preview-only flag for an isolated synthetic member and request; do not use real member data.
4. Independently correlate provider runs with successful customer-visible responses in a privacy-preserving aggregated test.
5. Add Budgeting application's own outbound completion instrumentation, then aggregate by coach and completed user turn (retry/multi-run costs included).
6. Do not adopt new prices until representative effective cost and p95 are known.

This is a preparatory instrumentation PR, not a claim that historical provider costs are already recoverable.
