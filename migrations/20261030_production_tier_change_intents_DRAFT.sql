CREATE TABLE IF NOT EXISTS public.ai_tier_change_intents (
 id text PRIMARY KEY CHECK (id ~ '^upg_[a-f0-9]{36}$'),
 member_key text NOT NULL CHECK (member_key ~ '^member_[a-f0-9]{64}$'),
 entitlement_key text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 stripe_subscription_id text NOT NULL CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 stripe_item_id text NOT NULL CHECK (stripe_item_id ~ '^si_[A-Za-z0-9]+$'),
 old_price_id text NOT NULL CHECK (old_price_id ~ '^price_[A-Za-z0-9]+$'),
 target_price_id text NOT NULL CHECK (target_price_id ~ '^price_[A-Za-z0-9]+$'),
 expected_limit integer NOT NULL CHECK (expected_limit BETWEEN 1 AND 10000),
 target_limit integer NOT NULL CHECK (target_limit > expected_limit AND target_limit <= 10000),
 invoice_id text UNIQUE CHECK (invoice_id IS NULL OR invoice_id ~ '^in_[A-Za-z0-9]+$'),
 state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','awaiting_payment','applied','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (period_start < period_end AND period_end - period_start <= interval '35 days'),
 CHECK (old_price_id <> target_price_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_tier_one_open_change_per_subscription
 ON public.ai_tier_change_intents(stripe_subscription_id)
 WHERE state IN ('prepared','awaiting_payment');
CREATE INDEX IF NOT EXISTS ai_tier_change_invoice_lookup
 ON public.ai_tier_change_intents(invoice_id) WHERE invoice_id IS NOT NULL;
REVOKE ALL ON TABLE public.ai_tier_change_intents FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ai_tier_apply_verified_paid_upgrade(
 p_intent text,p_invoice text,p_expected integer,p_target integer
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE i public.ai_tier_change_intents%ROWTYPE;
        w public.shared_ai_usage_periods%ROWTYPE;
BEGIN
 IF p_intent !~ '^upg_[a-f0-9]{36}$' OR
    p_invoice !~ '^in_[A-Za-z0-9]+$' OR
    p_expected < 1 OR p_target <= p_expected OR p_target > 10000
 THEN RETURN 'invalid_input'; END IF;
 SELECT * INTO i FROM public.ai_tier_change_intents
 WHERE id=p_intent AND invoice_id=p_invoice FOR UPDATE;
 IF NOT FOUND THEN RETURN 'intent_not_found'; END IF;
 IF i.state='applied' THEN RETURN 'already_applied'; END IF;
 IF i.state<>'awaiting_payment' OR
    i.expected_limit<>p_expected OR i.target_limit<>p_target OR
    now()<i.period_start OR now()>=i.period_end
 THEN RETURN 'intent_not_payable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i.member_key,90214));
 SELECT * INTO w FROM public.shared_ai_usage_periods
 WHERE member_key=i.member_key AND entitlement_key=i.entitlement_key
 AND period_start=i.period_start FOR UPDATE;
 IF NOT FOUND OR w.period_end<>i.period_end OR w.limit_uses<>p_expected OR
    w.completed_uses<0 OR w.reserved_uses<0 OR
    w.completed_uses+w.reserved_uses>p_expected
 THEN RETURN 'wallet_changed'; END IF;
 UPDATE public.shared_ai_usage_periods SET limit_uses=p_target
 WHERE member_key=i.member_key AND entitlement_key=i.entitlement_key
 AND period_start=i.period_start;
 UPDATE public.ai_tier_change_intents SET state='applied',updated_at=now()
 WHERE id=i.id AND state='awaiting_payment';
 RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.ai_tier_apply_verified_paid_upgrade(text,text,integer,integer) FROM PUBLIC;
