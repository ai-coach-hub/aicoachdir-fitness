-- PR #251 private test branch ONLY: additive paid continuation history.
-- Do not apply to the default Neon branch or public production databases.
CREATE TABLE IF NOT EXISTS public.introductory_paid_history (
 clerk_user_id text NOT NULL CHECK (clerk_user_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
 member_key text NOT NULL,
 entitlement_key text NOT NULL,
 period_start timestamptz NOT NULL,
 request_key text NOT NULL,
 coach text NOT NULL CHECK (coach IN ('fitness','budgeting','life')),
 user_message text NOT NULL,
 coach_response text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(clerk_user_id,request_key),
 FOREIGN KEY(member_key,entitlement_key,period_start,request_key)
  REFERENCES public.shared_ai_usage_requests(member_key,entitlement_key,period_start,request_key)
);
CREATE INDEX IF NOT EXISTS introductory_paid_history_member_idx
 ON public.introductory_paid_history(clerk_user_id,created_at);
