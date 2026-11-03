-- Sandbox-only durable intent. Never store email, card data or secrets.
-- The exact Stripe customer/subscription/item and wallet identity come from a
-- previously verified Clerk-authenticated membership, not webhook metadata.
CREATE TABLE IF NOT EXISTS public.ai_upgrade_intents (
 id text PRIMARY KEY CHECK (id ~ '^upg_[A-Za-z0-9_-]{16,100}$'),
 member_key text NOT NULL CHECK (member_key ~ '^member_[0-9a-f]{64}$'),
 entitlement_key text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 stripe_customer_id text NOT NULL,
 stripe_subscription_id text NOT NULL,
 stripe_item_id text NOT NULL,
 old_price_id text NOT NULL,
 target_price_id text NOT NULL,
 expected_limit integer NOT NULL CHECK (expected_limit > 0),
 target_limit integer NOT NULL CHECK (target_limit > expected_limit AND target_limit <= 10000),
 invoice_id text UNIQUE,
 state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','awaiting_payment','applied','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (period_start < period_end)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_upgrade_one_open_per_subscription
 ON public.ai_upgrade_intents(stripe_subscription_id)
 WHERE state IN ('prepared','awaiting_payment');
CREATE INDEX IF NOT EXISTS ai_upgrade_invoice_lookup
 ON public.ai_upgrade_intents(invoice_id) WHERE invoice_id IS NOT NULL;
