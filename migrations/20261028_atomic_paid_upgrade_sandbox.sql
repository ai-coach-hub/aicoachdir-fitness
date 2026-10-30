-- Sandbox-only atomic wallet + intent settlement.
-- Invoke solely after the server verifies the paid Stripe invoice,
-- subscription, original period, current item and approved destination.
CREATE OR REPLACE FUNCTION public.shared_ai_apply_paid_upgrade(
 p_intent text,p_invoice text,p_expected_limit integer,p_target_limit integer
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v public.ai_upgrade_intents%ROWTYPE; w public.shared_ai_usage_periods%ROWTYPE;
BEGIN
 IF p_intent !~ '^upg_[A-Za-z0-9_-]{16,100}$'
 OR p_invoice !~ '^in_[A-Za-z0-9]+$'
 OR p_expected_limit < 1 OR p_target_limit <= p_expected_limit
 OR p_target_limit > 10000 THEN RETURN 'invalid'; END IF;
 SELECT * INTO v FROM public.ai_upgrade_intents
 WHERE id=p_intent AND invoice_id=p_invoice FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing_intent'; END IF;
 IF v.state='applied' THEN RETURN 'already_applied'; END IF;
 IF v.state<>'awaiting_payment' OR v.expected_limit<>p_expected_limit
 OR v.target_limit<>p_target_limit OR clock_timestamp()<v.period_start
 OR clock_timestamp()>=v.period_end THEN RETURN 'invalid_state'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v.member_key,90214));
 SELECT * INTO w FROM public.shared_ai_usage_periods
 WHERE member_key=v.member_key AND entitlement_key=v.entitlement_key
 AND period_start=v.period_start FOR UPDATE;
 IF NOT FOUND OR w.period_end<>v.period_end
 OR w.limit_uses<>p_expected_limit OR w.completed_uses<0 OR w.reserved_uses<0
 OR w.completed_uses+w.reserved_uses>p_expected_limit
 THEN RETURN 'stale_wallet'; END IF;
 UPDATE public.shared_ai_usage_periods SET limit_uses=p_target_limit
 WHERE member_key=v.member_key AND entitlement_key=v.entitlement_key
 AND period_start=v.period_start;
 UPDATE public.ai_upgrade_intents SET state='applied',updated_at=now()
 WHERE id=v.id AND state='awaiting_payment';
 RETURN 'upgraded';
END $$;
REVOKE ALL ON FUNCTION public.shared_ai_apply_paid_upgrade(text,text,integer,integer) FROM PUBLIC;
