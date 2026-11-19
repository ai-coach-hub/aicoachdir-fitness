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
CREATE INDEX IF NOT EXISTS fitness_chat_jobs_created_idx
  ON public.fitness_chat_jobs (created_at);
COMMIT;
-- Private coaching responses are retained for at most seven days plus the
-- daily 04:00 UTC cron interval when authorized and functioning.
-- GET /api/internal/fitness-chat-retention runs in production only with CRON_SECRET
-- and the exact Neon branch ID. It deletes at most 5000 jobs per run; monitor
-- the deleted count and backlog before production enablement.
-- Do not remove or modify the authoritative workout plans, history or memberships.
-- Jobs older than 8 minutes are reported uncertain; never automatically replay
-- a Pickaxe completion when a caller disconnects or result cannot be confirmed.
