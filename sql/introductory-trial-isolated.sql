-- DRAFT: Apply only to isolated Neon branch after integration review.
-- Never apply this file to the production database in this PR.
-- A lifetime one-per-verified-Clerk-ID ledger.  Do not reset when a
-- customer later changes billing status.  Membership ownership must be
-- verified server-side; requests must use existing atomic reserve/settle
-- semantics, never client-reported counts.
CREATE TABLE IF NOT EXISTS public.introductory_trial_grants (
  clerk_user_id TEXT PRIMARY KEY CHECK (clerk_user_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
  member_key TEXT NOT NULL UNIQUE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entitlement_key TEXT NOT NULL DEFAULT 'introductory_lifetime_v1'
    CHECK(entitlement_key='introductory_lifetime_v1'),
  message_limit SMALLINT NOT NULL DEFAULT 15 CHECK(message_limit=15),
  converted_at TIMESTAMPTZ
);
-- Next integration step: use a dedicated atomic lifetime reserve/settle
-- policy on the existing shared usage ledger, preserving the original grant.
