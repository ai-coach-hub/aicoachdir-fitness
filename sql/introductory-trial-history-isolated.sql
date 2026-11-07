-- PR #251 isolated trial history. Applied only on br-spring-cloud-aui2mogd.
CREATE TABLE IF NOT EXISTS public.introductory_trial_history (
 clerk_user_id text NOT NULL REFERENCES public.introductory_trial_grants(clerk_user_id),
 request_key text NOT NULL,
 coach text NOT NULL CHECK (coach IN ('fitness','budgeting','life')),
 user_message text NOT NULL,
 coach_response text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT NOW(),
 PRIMARY KEY(clerk_user_id,request_key),
 FOREIGN KEY(clerk_user_id,request_key) REFERENCES public.introductory_trial_requests(clerk_user_id,request_key)
);
CREATE INDEX IF NOT EXISTS introductory_trial_history_user_time_idx
 ON public.introductory_trial_history(clerk_user_id,created_at);
