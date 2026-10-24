-- Isolated Life Coach launch benefit; does not change the shared 400-use wallet.
-- Apply to verified production Neon branch only after review and tests.
CREATE TABLE IF NOT EXISTS public.life_launch_wallets (
 member_key TEXT NOT NULL CHECK(member_key ~ '^member_[0-9a-f]{64}$'),
 period_start TIMESTAMPTZ NOT NULL,
 period_end TIMESTAMPTZ NOT NULL,
 completed_uses INTEGER NOT NULL DEFAULT 0 CHECK(completed_uses>=0),
 reserved_uses INTEGER NOT NULL DEFAULT 0 CHECK(reserved_uses>=0),
 limit_uses INTEGER NOT NULL DEFAULT 10 CHECK(limit_uses=10),
 PRIMARY KEY(member_key,period_start),
 CHECK(period_start<period_end),
 CHECK(completed_uses+reserved_uses<=limit_uses)
);
CREATE TABLE IF NOT EXISTS public.life_launch_requests (
 member_key TEXT NOT NULL,
 period_start TIMESTAMPTZ NOT NULL,
 request_key TEXT NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{16,100}$'),
 status TEXT NOT NULL CHECK(status IN ('reserved','completed','released','uncertain')),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(member_key,period_start,request_key),
 FOREIGN KEY(member_key,period_start)
  REFERENCES public.life_launch_wallets(member_key,period_start)
);
CREATE OR REPLACE FUNCTION public.life_launch_reserve(
 p_member TEXT,p_start TIMESTAMPTZ,p_end TIMESTAMPTZ,p_request TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE w public.life_launch_wallets%ROWTYPE; prior TEXT;
BEGIN
 IF p_member !~ '^member_[0-9a-f]{64}$'
  OR p_request !~ '^[A-Za-z0-9_-]{16,100}$'
  OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start
  OR p_end-p_start>INTERVAL '35 days'
  OR clock_timestamp()<p_start OR clock_timestamp()>=p_end
 THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_member,66847));
 PERFORM 1 FROM public.life_launch_wallets WHERE member_key=p_member
 AND period_start < p_end AND period_end > p_start AND period_start<>p_start;
 IF FOUND THEN RETURN 'overlapping_period'; END IF;
 INSERT INTO public.life_launch_wallets(member_key,period_start,period_end)
 VALUES(p_member,p_start,p_end) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM public.life_launch_wallets
 WHERE member_key=p_member AND period_start=p_start FOR UPDATE;
 IF NOT FOUND OR w.period_end<>p_end THEN RETURN 'period_mismatch'; END IF;
 SELECT status INTO prior FROM public.life_launch_requests
 WHERE member_key=p_member AND period_start=p_start AND request_key=p_request;
 IF FOUND THEN RETURN 'duplicate_'||prior; END IF;
 IF w.completed_uses+w.reserved_uses>=10 THEN RETURN 'exhausted'; END IF;
 INSERT INTO public.life_launch_requests(member_key,period_start,request_key,status)
 VALUES(p_member,p_start,p_request,'reserved');
 UPDATE public.life_launch_wallets SET reserved_uses=reserved_uses+1
 WHERE member_key=p_member AND period_start=p_start;
 RETURN 'reserved';
END $$;
CREATE OR REPLACE FUNCTION public.life_launch_settle(
 p_member TEXT,p_start TIMESTAMPTZ,p_request TEXT,p_outcome TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE prior TEXT;
BEGIN
 IF p_outcome NOT IN ('completed','released','uncertain') THEN RETURN 'invalid'; END IF;
 PERFORM 1 FROM public.life_launch_wallets
 WHERE member_key=p_member AND period_start=p_start FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 SELECT status INTO prior FROM public.life_launch_requests
 WHERE member_key=p_member AND period_start=p_start AND request_key=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF prior<>'reserved' THEN RETURN 'already_'||prior; END IF;
 UPDATE public.life_launch_requests SET status=p_outcome,changed_at=now()
 WHERE member_key=p_member AND period_start=p_start AND request_key=p_request;
 UPDATE public.life_launch_wallets
 SET reserved_uses=reserved_uses-CASE WHEN p_outcome='uncertain' THEN 0 ELSE 1 END,
 completed_uses=completed_uses+CASE WHEN p_outcome='completed' THEN 1 ELSE 0 END
 WHERE member_key=p_member AND period_start=p_start;
 RETURN p_outcome;
END $$;
REVOKE ALL ON public.life_launch_wallets FROM PUBLIC;
REVOKE ALL ON public.life_launch_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION public.life_launch_reserve(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.life_launch_settle(TEXT,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC;
