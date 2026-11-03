-- Additive production candidate. REVIEW BEFORE APPLYING; no customer rows modified.
-- Separate from sandbox intent schema; release code must use this explicitly.
CREATE TABLE IF NOT EXISTS public.member_plan_change_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_key text NOT NULL CHECK(member_key ~ '^member_[0-9a-f]{64}$'),
 clerk_user_id text NOT NULL CHECK(clerk_user_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
 stripe_customer_id text NOT NULL CHECK(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 stripe_subscription_id text NOT NULL CHECK(stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 stripe_item_id text NOT NULL CHECK(stripe_item_id ~ '^si_[A-Za-z0-9]+$'),
 from_price_id text NOT NULL CHECK(from_price_id ~ '^price_[A-Za-z0-9]+$'),
 to_price_id text NOT NULL CHECK(to_price_id ~ '^price_[A-Za-z0-9]+$'),
 entitlement_key text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 before_limit integer NOT NULL CHECK(before_limit BETWEEN 1 AND 10000),
 after_limit integer NOT NULL CHECK(after_limit BETWEEN 1 AND 10000),
 kind text NOT NULL CHECK(kind IN ('upgrade','downgrade_at_renewal')),
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','submitted','awaiting_payment','scheduled','applied','failed')),
 invoice_id text UNIQUE,
 stripe_schedule_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT plan_change_real_difference CHECK(from_price_id<>to_price_id),
 CONSTRAINT plan_change_valid_period CHECK(period_start<period_end AND period_end-period_start<=interval '35 days'),
 CONSTRAINT plan_change_valid_direction CHECK((kind='upgrade' AND after_limit>before_limit) OR
 (kind='downgrade_at_renewal' AND after_limit<before_limit))
);
CREATE UNIQUE INDEX IF NOT EXISTS member_one_open_plan_change
 ON public.member_plan_change_intents(stripe_subscription_id)
 WHERE state IN ('prepared','submitted','awaiting_payment','scheduled');
CREATE INDEX IF NOT EXISTS member_plan_change_customer_lookup
 ON public.member_plan_change_intents(stripe_customer_id,created_at DESC);
REVOKE ALL ON public.member_plan_change_intents FROM PUBLIC;
-- No INSERT/UPDATE to fitness_memberships, saved work, or shared_ai_usage_periods.
