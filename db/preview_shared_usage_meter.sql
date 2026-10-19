-- PREVIEW-ONLY prototype. Never run against production without a separate approved migration.
-- One member-visible generation request consumes one reserved use. Read-only recall and page views do not.
CREATE TABLE IF NOT EXISTS preview_ai_usage_periods (
 member_id text NOT NULL,
 subscription_key text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 limit_uses integer NOT NULL CHECK (limit_uses >= 0),
 reserved_uses integer NOT NULL DEFAULT 0 CHECK (reserved_uses >= 0),
 completed_uses integer NOT NULL DEFAULT 0 CHECK (completed_uses >= 0),
 PRIMARY KEY(member_id,subscription_key,period_start),
 CHECK (period_end > period_start),
 CHECK (reserved_uses + completed_uses <= limit_uses)
);
CREATE TABLE IF NOT EXISTS preview_ai_usage_requests (
 member_id text NOT NULL,
 subscription_key text NOT NULL,
 period_start timestamptz NOT NULL,
 request_key text NOT NULL,
 coach text NOT NULL CHECK(coach IN ('fitness','budgeting','life','career')),
 status text NOT NULL CHECK(status IN ('reserved','completed','released','uncertain')),
 created_at timestamptz NOT NULL DEFAULT NOW(),
 changed_at timestamptz NOT NULL DEFAULT NOW(),
 PRIMARY KEY(member_id,subscription_key,period_start,request_key),
 FOREIGN KEY(member_id,subscription_key,period_start)
  REFERENCES preview_ai_usage_periods(member_id,subscription_key,period_start)
);
CREATE TABLE IF NOT EXISTS preview_ai_provider_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id text NOT NULL,
 subscription_key text NOT NULL,
 period_start timestamptz NOT NULL,
 request_key text NOT NULL,
 provider text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('success','failure','timeout','unknown')),
 estimated_cost_usd numeric(14,6) CHECK(estimated_cost_usd >= 0),
 created_at timestamptz NOT NULL DEFAULT NOW(),
 FOREIGN KEY(member_id,subscription_key,period_start,request_key)
  REFERENCES preview_ai_usage_requests(member_id,subscription_key,period_start,request_key)
);
-- Atomic reservation: first verify a server-derived entitlement, then create / reuse request key.
-- The caller must never select the billing period or allowance from browser input.
CREATE OR REPLACE FUNCTION preview_ai_reserve(
 p_member text, p_subscription text, p_start timestamptz,
 p_request text, p_coach text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE p preview_ai_usage_periods%ROWTYPE; existing_status text;
BEGIN
 IF p_member='' OR p_subscription='' OR length(p_request)<8 OR p_coach NOT IN ('fitness','budgeting','life','career')
 THEN RETURN 'invalid'; END IF;
 SELECT * INTO p FROM preview_ai_usage_periods
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start FOR UPDATE;
 IF NOT FOUND OR clock_timestamp()<p.period_start OR clock_timestamp()>=p.period_end THEN RETURN 'ineligible'; END IF;
 SELECT status INTO existing_status FROM preview_ai_usage_requests
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start AND request_key=p_request;
 IF FOUND THEN RETURN CASE WHEN existing_status='released' THEN 'released' ELSE 'duplicate_'||existing_status END; END IF;
 IF p.completed_uses+p.reserved_uses>=p.limit_uses THEN RETURN 'exhausted'; END IF;
 INSERT INTO preview_ai_usage_requests(member_id,subscription_key,period_start,request_key,coach,status)
 VALUES(p_member,p_subscription,p_start,p_request,p_coach,'reserved');
 UPDATE preview_ai_usage_periods SET reserved_uses=reserved_uses+1
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start;
 RETURN 'reserved';
END $$;
CREATE OR REPLACE FUNCTION preview_ai_settle(
 p_member text, p_subscription text, p_start timestamptz,
 p_request text, p_outcome text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE previous_status text;
BEGIN
 IF p_outcome NOT IN ('completed','released','uncertain') THEN RETURN 'invalid'; END IF;
 PERFORM 1 FROM preview_ai_usage_periods
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start FOR UPDATE;
 IF NOT FOUND THEN RETURN 'ineligible'; END IF;
 SELECT status INTO previous_status FROM preview_ai_usage_requests
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start AND request_key=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF previous_status<>'reserved' THEN RETURN 'already_'||previous_status; END IF;
 UPDATE preview_ai_usage_requests SET status=p_outcome,changed_at=now()
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start AND request_key=p_request;
 -- Timeouts stay reserved until a safe reconciliation determines actual model cost.
 UPDATE preview_ai_usage_periods
 SET reserved_uses=reserved_uses-CASE WHEN p_outcome='uncertain' THEN 0 ELSE 1 END,
     completed_uses=completed_uses+CASE WHEN p_outcome='completed' THEN 1 ELSE 0 END
 WHERE member_id=p_member AND subscription_key=p_subscription AND period_start=p_start;
 RETURN p_outcome;
END $$;
