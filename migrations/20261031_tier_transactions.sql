-- Run after 20261030_production_tier_change_intents_DRAFT.sql.
-- Add transaction state without rewriting memberships, balances or coaching data.
BEGIN;
ALTER TABLE public.ai_tier_change_intents
 ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'upgrade',
 ADD COLUMN IF NOT EXISTS proration_date bigint,
 ADD COLUMN IF NOT EXISTS quoted_amount integer,
 ADD COLUMN IF NOT EXISTS quoted_at timestamptz,
 ADD COLUMN IF NOT EXISTS schedule_id text;
ALTER TABLE public.ai_tier_change_intents DROP CONSTRAINT IF EXISTS ai_tier_change_intents_check;
ALTER TABLE public.ai_tier_change_intents ADD CONSTRAINT ai_tier_change_intents_check CHECK
 ((direction='upgrade' AND target_limit>expected_limit AND target_limit<=10000) OR
  (direction='downgrade' AND target_limit>0 AND target_limit<expected_limit));
ALTER TABLE public.ai_tier_change_intents DROP CONSTRAINT IF EXISTS ai_tier_change_intents_state_check;
ALTER TABLE public.ai_tier_change_intents ADD CONSTRAINT ai_tier_change_intents_state_check
 CHECK(state IN ('prepared','awaiting_payment','scheduled','applied','failed'));
-- Existing open-request index remains useful. This index also includes scheduled changes.
CREATE UNIQUE INDEX IF NOT EXISTS ai_tier_one_unfinished_change
 ON public.ai_tier_change_intents(stripe_subscription_id) WHERE state IN ('prepared','awaiting_payment','scheduled');
CREATE OR REPLACE FUNCTION public.ai_tier_apply_paid_renewal(
 p_intent text,p_invoice text,p_start timestamptz,p_end timestamptz,p_limit integer
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE i public.ai_tier_change_intents%ROWTYPE; w public.shared_ai_usage_periods%ROWTYPE;
BEGIN
 SELECT * INTO i FROM public.ai_tier_change_intents WHERE id=p_intent FOR UPDATE;
 IF NOT FOUND OR i.state NOT IN ('scheduled','applied') OR i.target_limit<>p_limit OR
 p_start<i.period_end OR p_end<=p_start OR p_end-p_start>interval '35 days' OR
 p_invoice !~ '^in_[A-Za-z0-9]+$' THEN RETURN 'invalid_renewal'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i.member_key,90214));
 SELECT * INTO w FROM public.shared_ai_usage_periods WHERE member_key=i.member_key
 AND entitlement_key=i.entitlement_key AND period_start=p_start FOR UPDATE;
 IF FOUND THEN
  IF w.period_end<>p_end OR w.limit_uses<>p_limit THEN RETURN 'wallet_conflict'; END IF;
 ELSE
  INSERT INTO public.shared_ai_usage_periods(member_key,entitlement_key,period_start,period_end,limit_uses,completed_uses,reserved_uses)
  VALUES(i.member_key,i.entitlement_key,p_start,p_end,p_limit,0,0);
 END IF;
 IF i.state='scheduled' THEN
  UPDATE public.ai_tier_change_intents SET state='applied',invoice_id=p_invoice,updated_at=now() WHERE id=i.id;
 END IF;
 RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.ai_tier_apply_paid_renewal(text,text,timestamptz,timestamptz,integer) FROM PUBLIC;
COMMIT;
