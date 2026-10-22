-- SHARED AI USAGE: REVIEWED PRIVATE BRANCH MIGRATION, NOT APPLIED TO PRODUCTION.
-- One wallet across Fitness, Budgeting and Life. Opaque HMAC identity only.
-- All member, price and billing-period facts MUST be verified server-side.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shared_ai_usage_periods (
 member_key text NOT NULL,
 entitlement_key text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 limit_uses integer NOT NULL CHECK (limit_uses BETWEEN 1 AND 10000),
 reserved_uses integer NOT NULL DEFAULT 0 CHECK (reserved_uses >= 0),
 completed_uses integer NOT NULL DEFAULT 0 CHECK (completed_uses >= 0),
 PRIMARY KEY(member_key,entitlement_key,period_start),
 CHECK (period_start < period_end),
 CHECK (reserved_uses + completed_uses <= limit_uses)
);
CREATE INDEX IF NOT EXISTS shared_ai_usage_member_period_idx
 ON public.shared_ai_usage_periods(member_key,period_end DESC);
CREATE TABLE IF NOT EXISTS public.shared_ai_usage_requests (
 member_key text NOT NULL,
 entitlement_key text NOT NULL,
 period_start timestamptz NOT NULL,
 request_key text NOT NULL,
 coach text NOT NULL CHECK (coach IN ('fitness','budgeting','life')),
 status text NOT NULL CHECK (status IN ('reserved','completed','released','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now(),
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(member_key,entitlement_key,period_start,request_key),
 FOREIGN KEY(member_key,entitlement_key,period_start)
 REFERENCES public.shared_ai_usage_periods(member_key,entitlement_key,period_start)
);
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
COMMIT;
