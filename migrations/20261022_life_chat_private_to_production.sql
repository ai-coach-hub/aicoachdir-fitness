-- Life Coach production schema proposal; REVIEW ONLY. Not executed by the app.
-- Apply through a reviewed migration against the intended production database,
-- after backup, access-policy audit and explicit launch approval.
-- Existing private preview remains on its isolated Neon branch.
BEGIN;
CREATE TABLE IF NOT EXISTS public.life_chat_threads (
  member_id text NOT NULL,
  id text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT life_chat_threads_pkey PRIMARY KEY (member_id,id)
);
CREATE TABLE IF NOT EXISTS public.life_chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id text NOT NULL,
  conversation_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT life_chat_messages_thread_fk
    FOREIGN KEY (member_id,conversation_id)
    REFERENCES public.life_chat_threads(member_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS life_chat_threads_member_updated_idx
 ON public.life_chat_threads (member_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS life_chat_messages_member_thread_idx
 ON public.life_chat_messages (member_id,conversation_id,id);
COMMIT;
-- IMPORTANT: This SQL is only the schema. Auth/entitlement checks in EVERY
-- API route and separate verified paid metering remain mandatory launch gates.
