-- PREVIEW QA MIGRATION ONLY: never run on the live Neon branch without
-- end-to-end Stripe sandbox verification and an explicit release approval.
-- Persist a verified in-place subscription change before making Stripe calls.
CREATE TABLE IF NOT EXISTS public.shared_ai_upgrade_intents (
 intent_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_key text NOT NULL CHECK (member_key ~ '^member_[0-9a-f]{64}$'),
 clerk_user_id text NOT NULL CHECK (clerk_user_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
 stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 stripe_subscription_id text NOT NULL CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 stripe_item_id text NOT NULL CHECK (stripe_item_id ~ '^si_[A-Za-z0-9]+$'),
 old_price_id text NOT NULL CHECK (old_price_id ~ '^price_[A-Za-z0-9]+$'),
 target_price_id text NOT NULL CHECK (target_price_id ~ '^price_[A-Za-z0-9]+$'),
 entitlement_key text NOT NULL,
 expected_limit integer NOT NULL CHECK (expected_limit BETWEEN 1 AND 10000),
 target_limit integer NOT NULL CHECK (target_limit BETWEEN 1 AND 10000),
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'prepared'
  CHECK (status IN ('prepared','submitted','applied','rejected')),
 invoice_id text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (old_price_id <> target_price_id),
 CHECK (target_limit > expected_limit),
 CHECK (period_start < period_end AND period_end - period_start <= interval '35 days')
);
CREATE UNIQUE INDEX IF NOT EXISTS shared_ai_one_open_upgrade_per_subscription
 ON public.shared_ai_upgrade_intents(stripe_subscription_id)
 WHERE status IN ('prepared','submitted');
CREATE INDEX IF NOT EXISTS shared_ai_upgrade_intent_subscription_idx
 ON public.shared_ai_upgrade_intents(stripe_subscription_id,created_at DESC);
-- Only the server database role can invoke the atomic transition.
CREATE OR REPLACE FUNCTION public.shared_ai_apply_paid_upgrade(
 p_intent_id uuid,p_invoice_id text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_intent public.shared_ai_upgrade_intents%ROWTYPE;
        v_wallet public.shared_ai_usage_periods%ROWTYPE;
BEGIN
 IF p_intent_id IS NULL OR p_invoice_id !~ '^in_[A-Za-z0-9]+$'
 THEN RETURN 'invalid'; END IF;
 SELECT * INTO v_intent FROM public.shared_ai_upgrade_intents
 WHERE intent_id=p_intent_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 'intent_not_found'; END IF;
 IF v_intent.status='applied'
 THEN RETURN CASE WHEN v_intent.invoice_id=p_invoice_id
          THEN 'already_applied' ELSE 'invoice_mismatch' END; END IF;
 IF v_intent.status NOT IN ('prepared','submitted') THEN RETURN 'not_pending'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_intent.member_key,90214));
 SELECT * INTO v_wallet FROM public.shared_ai_usage_periods
 WHERE member_key=v_intent.member_key
 AND entitlement_key=v_intent.entitlement_key
 AND period_start=v_intent.period_start FOR UPDATE;
 IF NOT FOUND THEN RETURN 'wallet_not_found'; END IF;
 IF v_wallet.period_end<>v_intent.period_end
   OR v_wallet.limit_uses<>v_intent.expected_limit
 THEN RETURN 'wallet_not_expected'; END IF;
 IF v_wallet.completed_uses<0 OR v_wallet.reserved_uses<0
 OR v_wallet.completed_uses+v_wallet.reserved_uses>v_wallet.limit_uses
 THEN RETURN 'wallet_inconsistent'; END IF;
 UPDATE public.shared_ai_usage_periods SET limit_uses=v_intent.target_limit
 WHERE member_key=v_intent.member_key
 AND entitlement_key=v_intent.entitlement_key
 AND period_start=v_intent.period_start;
 UPDATE public.shared_ai_upgrade_intents
 SET status='applied',invoice_id=p_invoice_id,updated_at=now()
 WHERE intent_id=p_intent_id;
 RETURN 'upgraded';
END $$;
REVOKE ALL ON TABLE public.shared_ai_upgrade_intents FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shared_ai_apply_paid_upgrade(uuid,text) FROM PUBLIC;
