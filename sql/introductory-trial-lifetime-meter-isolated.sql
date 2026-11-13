-- PR #251 ONLY: isolated Neon branch. Do not apply to production.
CREATE TABLE IF NOT EXISTS public.introductory_trial_grants (
 clerk_user_id text PRIMARY KEY CHECK(clerk_user_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
 member_key text NOT NULL UNIQUE CHECK(member_key ~ '^member_[0-9a-f]{64}$'),
 granted_at timestamptz NOT NULL DEFAULT now(),
 entitlement_key text NOT NULL DEFAULT 'introductory_lifetime_v1' CHECK(entitlement_key='introductory_lifetime_v1'),
 message_limit smallint NOT NULL DEFAULT 15 CHECK(message_limit=15),
 completed_uses smallint NOT NULL DEFAULT 0 CHECK(completed_uses BETWEEN 0 AND 15),
 reserved_uses smallint NOT NULL DEFAULT 0 CHECK(reserved_uses BETWEEN 0 AND 15),
 converted_at timestamptz,
 CHECK(completed_uses+reserved_uses<=message_limit)
);
CREATE TABLE IF NOT EXISTS public.introductory_trial_requests (
 clerk_user_id text NOT NULL REFERENCES public.introductory_trial_grants(clerk_user_id),
 request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{16,100}$'),
 coach text NOT NULL CHECK(coach IN ('fitness','budgeting','life')),
 status text NOT NULL CHECK(status IN ('reserved','completed','released','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now(),
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(clerk_user_id,request_key)
);
CREATE OR REPLACE FUNCTION public.intro_trial_reserve(p_user text,p_member text,p_request text,p_coach text)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE v public.introductory_trial_grants%ROWTYPE; old public.introductory_trial_requests%ROWTYPE;
BEGIN
 IF p_user !~ '^user_[A-Za-z0-9_-]{8,128}$' OR p_member !~ '^member_[0-9a-f]{64}$'
 OR p_request !~ '^[A-Za-z0-9_-]{16,100}$' OR p_coach NOT IN ('fitness','budgeting','life')
 THEN RETURN 'invalid'; END IF;
 SELECT * INTO v FROM public.introductory_trial_grants WHERE clerk_user_id=p_user FOR UPDATE;
 IF NOT FOUND OR v.member_key<>p_member THEN RETURN 'not_entitled'; END IF;
 SELECT * INTO old FROM public.introductory_trial_requests WHERE clerk_user_id=p_user AND request_key=p_request;
 IF FOUND THEN
  IF old.coach<>p_coach THEN RETURN 'replay_conflict'; END IF;
  RETURN 'duplicate_'||old.status;
 END IF;
 IF v.converted_at IS NOT NULL THEN RETURN 'converted'; END IF;
 IF v.completed_uses+v.reserved_uses>=15 THEN RETURN 'exhausted'; END IF;
 INSERT INTO public.introductory_trial_requests(clerk_user_id,request_key,coach,status) VALUES(p_user,p_request,p_coach,'reserved');
 UPDATE public.introductory_trial_grants SET reserved_uses=reserved_uses+1 WHERE clerk_user_id=p_user;
 RETURN 'reserved';
END $fn$;
CREATE OR REPLACE FUNCTION public.intro_trial_settle(p_user text,p_member text,p_request text,p_coach text,p_outcome text)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE v public.introductory_trial_grants%ROWTYPE; old public.introductory_trial_requests%ROWTYPE;
BEGIN
 IF p_outcome NOT IN ('completed','released','uncertain') THEN RETURN 'invalid'; END IF;
 SELECT * INTO v FROM public.introductory_trial_grants WHERE clerk_user_id=p_user FOR UPDATE;
 IF NOT FOUND OR v.member_key<>p_member THEN RETURN 'not_entitled'; END IF;
 SELECT * INTO old FROM public.introductory_trial_requests WHERE clerk_user_id=p_user AND request_key=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF old.coach<>p_coach THEN RETURN 'replay_conflict'; END IF;
 IF old.status<>'reserved' THEN RETURN 'already_'||old.status; END IF;
 UPDATE public.introductory_trial_requests SET status=p_outcome,changed_at=now() WHERE clerk_user_id=p_user AND request_key=p_request;
 UPDATE public.introductory_trial_grants
 SET reserved_uses=reserved_uses-CASE WHEN p_outcome='uncertain' THEN 0 ELSE 1 END,
 completed_uses=completed_uses+CASE WHEN p_outcome='completed' THEN 1 ELSE 0 END
 WHERE clerk_user_id=p_user;
 RETURN p_outcome;
END $fn$;
