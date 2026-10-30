-- REVIEW ONLY. DO NOT APPLY TO PRODUCTION UNTIL PAID UPGRADE FLOW IS VERIFIED.
-- This single-row, atomic change preserves completed and reserved AI messages.
-- Caller must verify Clerk identity, Stripe ownership, approved price transition,
-- paid invoice and unchanged period BEFORE calling. No public HTTP route calls it.
BEGIN;
CREATE OR REPLACE FUNCTION public.shared_ai_upgrade_allowance(
 p_member text, p_entitlement text, p_start timestamptz, p_end timestamptz,
 p_expected_limit integer, p_target_limit integer
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v public.shared_ai_usage_periods%ROWTYPE;
BEGIN
 IF p_member !~ '^member_[0-9a-f]{64}$'
    OR p_entitlement !~ '^[A-Za-z0-9_-]{4,128}$'
    OR p_start IS NULL OR p_end IS NULL OR p_start>=p_end
    OR p_expected_limit<1 OR p_target_limit<=p_expected_limit
    OR p_target_limit>10000
    OR clock_timestamp()<p_start OR clock_timestamp()>=p_end
 THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_member,90214));
 SELECT * INTO v FROM public.shared_ai_usage_periods
 WHERE member_key=p_member AND entitlement_key=p_entitlement
   AND period_start=p_start FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF v.period_end<>p_end OR v.limit_uses<>p_expected_limit
 THEN RETURN 'stale_or_already_changed'; END IF;
 IF v.completed_uses<0 OR v.reserved_uses<0 OR
    v.completed_uses+v.reserved_uses>v.limit_uses
 THEN RETURN 'invalid_existing_usage'; END IF;
 UPDATE public.shared_ai_usage_periods SET limit_uses=p_target_limit
 WHERE member_key=p_member AND entitlement_key=p_entitlement AND period_start=p_start;
 RETURN 'upgraded';
END $$;
REVOKE ALL ON FUNCTION public.shared_ai_upgrade_allowance(text,text,timestamptz,timestamptz,integer,integer) FROM PUBLIC;
COMMIT;
