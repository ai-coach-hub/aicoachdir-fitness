-- PRIVATE TEST BRANCH ONLY. Applied only on Neon br-autumn-breeze-auw38rgr.
-- Bind a verified Clerk tester to an opaque HMAC of their verified email.
-- No email address or identity-bearing claim is stored in the quota ledger.
CREATE TABLE IF NOT EXISTS public.preview_ai_member_bindings (
 member_key text PRIMARY KEY,
 clerk_member_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
