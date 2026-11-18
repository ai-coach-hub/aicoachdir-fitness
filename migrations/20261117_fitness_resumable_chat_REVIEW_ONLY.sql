-- Resumable Fitness Coach requests; REVIEW/APPLY BEFORE ENABLEMENT.
-- Production only: verify this is the Fitness membership Neon production branch
-- (br-sparkling-glitter-aucpz59d), back up, and approve before executing.
-- Never run this against private preview or another app's database.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fitness_chat_jobs (
  member_email text NOT NULL,
  request_key text NOT NULL,
  conversation_id text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued', 'running', 'complete', 'error', 'uncertain')),
  http_status integer,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fitness_chat_jobs_pkey PRIMARY KEY (member_email, request_key)
);
CREATE INDEX IF NOT EXISTS fitness_chat_jobs_member_created_idx
  ON public.fitness_chat_jobs (member_email, created_at DESC);
COMMIT;
-- Data is member-scoped. Schedule a reviewed retention policy before enablement:
-- results may contain private coaching details. A 7-day retention policy is suggested.
-- Do not delete an unfinished job automatically; read-only status reporting marks
-- stale requests uncertain without ever replaying a paid Pickaxe mutation.
