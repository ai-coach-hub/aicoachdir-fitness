-- Reviewed follow-up migration: apply only after isolated-branch validation.
-- Requires the four empty tables already added to production.
BEGIN;
CREATE OR REPLACE FUNCTION public.shared_ai_reserve(
 p_member text,p_entitlement text,p_start timestamptz,p_end timestamptz,
 p_limit integer,p_request text,p_coach text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_period public.shared_ai_usage_periods%ROWTYPE; v_status text;
BEGIN
 IF p_member !~ '^member_[0-9a-f]{64}$'
    OR p_entitlement !~ '^[A-Za-z0-9_-]{4,128}$'
    OR p_request !~ '^[A-Za-z0-9_-]{16,100}$'
    OR p_coach NOT IN ('fitness','budgeting','life')
    OR p_limit < 1 OR p_limit > 10000
    OR p_start IS NULL OR p_end IS NULL
    OR p_end <= p_start OR p_end-p_start > INTERVAL '35 days'
    OR clock_timestamp() < p_start OR clock_timestamp() >= p_end
 THEN RETURN 'invalid'; END IF;
 -- A single member cannot acquire two overlapping wallets across
 -- reactivation, login changes, price changes or subscription replacement.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_member,90214));
 PERFORM 1 FROM public.shared_ai_usage_periods
 WHERE member_key=p_member AND period_start < p_end AND period_end > p_start
 AND (entitlement_key<>p_entitlement OR period_start<>p_start);
 IF FOUND THEN RETURN 'overlapping_period'; END IF;
 INSERT INTO public.shared_ai_usage_periods
 (member_key,entitlement_key,period_start,period_end,limit_uses)
 VALUES(p_member,p_entitlement,p_start,p_end,p_limit)
 ON CONFLICT DO NOTHING;
 SELECT * INTO v_period FROM public.shared_ai_usage_periods
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start FOR UPDATE;
 IF NOT FOUND OR v_period.period_end<>p_end OR v_period.limit_uses<>p_limit
 THEN RETURN 'period_mismatch'; END IF;
 SELECT status INTO v_status FROM public.shared_ai_usage_requests
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start AND request_key=p_request;
 IF FOUND THEN RETURN 'duplicate_'||v_status; END IF;
 IF v_period.completed_uses+v_period.reserved_uses>=v_period.limit_uses
 THEN RETURN 'exhausted'; END IF;
 INSERT INTO public.shared_ai_usage_requests(member_key,entitlement_key,period_start,request_key,coach,status)
 VALUES(p_member,p_entitlement,p_start,p_request,p_coach,'reserved');
 UPDATE public.shared_ai_usage_periods SET reserved_uses=reserved_uses+1
 WHERE member_key=p_member AND entitlement_key=p_entitlement AND period_start=p_start;
 RETURN 'reserved';
END $$;
CREATE OR REPLACE FUNCTION public.shared_ai_settle(
 p_member text,p_entitlement text,p_start timestamptz,
 p_request text,p_outcome text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
 IF p_outcome NOT IN ('completed','released','uncertain')
 THEN RETURN 'invalid'; END IF;
 PERFORM 1 FROM public.shared_ai_usage_periods
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start FOR UPDATE;
 IF NOT FOUND THEN RETURN 'ineligible'; END IF;
 SELECT status INTO v_status FROM public.shared_ai_usage_requests
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start AND request_key=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF v_status<>'reserved' THEN RETURN 'already_'||v_status; END IF;
 UPDATE public.shared_ai_usage_requests
 SET status=p_outcome,changed_at=now()
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start AND request_key=p_request;
 -- An uncertain upstream timeout retains the reserved slot for review.
 UPDATE public.shared_ai_usage_periods
 SET reserved_uses=reserved_uses-CASE WHEN p_outcome='uncertain' THEN 0 ELSE 1 END,
 completed_uses=completed_uses+CASE WHEN p_outcome='completed' THEN 1 ELSE 0 END
 WHERE member_key=p_member AND entitlement_key=p_entitlement AND period_start=p_start;
 RETURN p_outcome;
END $$;
-- Operator-only resolution of uncertain provider outcomes.
-- A retry cannot mint fresh uses; only a verified provider outcome allows
-- a held slot to be counted or released. No customer-facing route calls this.
CREATE OR REPLACE FUNCTION public.shared_ai_reconcile(
 p_member text,p_entitlement text,p_start timestamptz,
 p_request text,p_actual text
) RETURNS text LANGUAGE plpgsql AS $
DECLARE v_status text;
BEGIN
 IF p_actual NOT IN ('completed','released')
 THEN RETURN 'invalid'; END IF;
 PERFORM 1 FROM public.shared_ai_usage_periods
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start FOR UPDATE;
 IF NOT FOUND THEN RETURN 'ineligible'; END IF;
 SELECT status INTO v_status FROM public.shared_ai_usage_requests
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start AND request_key=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF v_status <> 'uncertain' THEN RETURN 'already_'||v_status; END IF;
 UPDATE public.shared_ai_usage_requests
 SET status=p_actual,changed_at=now()
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start AND request_key=p_request;
 UPDATE public.shared_ai_usage_periods
 SET reserved_uses=reserved_uses-1,
 completed_uses=completed_uses+CASE WHEN p_actual='completed' THEN 1 ELSE 0 END
 WHERE member_key=p_member AND entitlement_key=p_entitlement
 AND period_start=p_start;
 RETURN p_actual;
END $;
-- No anonymous/PUBLIC access to grant, debit or reconcile AI usage.
-- The server-side database owner retains execution privileges.
REVOKE ALL ON FUNCTION public.shared_ai_reserve(text,text,timestamptz,timestamptz,integer,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shared_ai_settle(text,text,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shared_ai_reconcile(text,text,timestamptz,text,text) FROM PUBLIC;
COMMIT;
