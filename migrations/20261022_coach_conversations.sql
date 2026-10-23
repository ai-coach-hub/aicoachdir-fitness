-- Additive, reusable, provider-agnostic conversation storage for NEW coaches.
-- Existing Fitness/Pickaxe, Budgeting and Life Coach histories remain unchanged.
-- Every row is scoped to the verified Clerk member AND the coach identifier.
BEGIN;

CREATE TABLE IF NOT EXISTS public.coach_conversation_threads (
  coach_key text NOT NULL
    CHECK (coach_key ~ '^[a-z][a-z0-9_-]{2,40}$'),
  member_id text NOT NULL
    CHECK (member_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
  thread_id text NOT NULL
    CHECK (thread_id ~ '^thread_[A-Za-z0-9_-]{8,100}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_key,member_id,thread_id)
);

CREATE INDEX IF NOT EXISTS coach_conversation_threads_member_recent_idx
  ON public.coach_conversation_threads (member_id,coach_key,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.coach_conversation_turns (
  coach_key text NOT NULL,
  member_id text NOT NULL,
  thread_id text NOT NULL,
  request_key text NOT NULL
    CHECK (request_key ~ '^[A-Za-z0-9_-]{16,100}$'),
  turn_index bigint GENERATED ALWAYS AS IDENTITY,
  user_text text NOT NULL
    CHECK (length(user_text) BETWEEN 1 AND 12000),
  assistant_text text NOT NULL
    CHECK (length(assistant_text) BETWEEN 1 AND 24000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_key,member_id,thread_id,request_key),
  FOREIGN KEY (coach_key,member_id,thread_id)
    REFERENCES public.coach_conversation_threads(coach_key,member_id,thread_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS coach_conversation_turns_thread_order_idx
  ON public.coach_conversation_turns
  (member_id,coach_key,thread_id,turn_index);

-- Writes a complete user/assistant pair atomically, and makes retries safe.
-- This procedure does not authorize access; the server must derive member_id
-- from verified Clerk identity and reserve the AI use before model inference.
CREATE OR REPLACE FUNCTION public.coach_conversation_save(
  p_coach text,p_member text,p_thread text,p_request text,
  p_message text,p_reply text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE existing_user text;
DECLARE existing_reply text;
BEGIN
  IF p_coach IS NULL OR p_coach !~ '^[a-z][a-z0-9_-]{2,40}$'
    OR p_member IS NULL OR p_member !~ '^user_[A-Za-z0-9_-]{8,128}$'
    OR p_thread IS NULL OR p_thread !~ '^thread_[A-Za-z0-9_-]{8,100}$'
    OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9_-]{16,100}$'
    OR p_message IS NULL OR length(p_message) NOT BETWEEN 1 AND 12000
    OR p_reply IS NULL OR length(p_reply) NOT BETWEEN 1 AND 24000
  THEN RETURN 'invalid'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_coach || ':' || p_member || ':' || p_thread, 92714)
  );

  SELECT user_text,assistant_text INTO existing_user,existing_reply
    FROM public.coach_conversation_turns
   WHERE coach_key=p_coach AND member_id=p_member
     AND thread_id=p_thread AND request_key=p_request;
  IF FOUND THEN
    IF existing_user=p_message AND existing_reply=p_reply
    THEN RETURN 'duplicate'; END IF;
    RETURN 'conflict';
  END IF;

  INSERT INTO public.coach_conversation_threads
    (coach_key,member_id,thread_id,updated_at)
    VALUES(p_coach,p_member,p_thread,now())
    ON CONFLICT (coach_key,member_id,thread_id)
    DO UPDATE SET updated_at=now();

  INSERT INTO public.coach_conversation_turns
    (coach_key,member_id,thread_id,request_key,user_text,assistant_text)
    VALUES(p_coach,p_member,p_thread,p_request,p_message,p_reply);

  RETURN 'saved';
END $$;

REVOKE ALL ON FUNCTION public.coach_conversation_save(text,text,text,text,text,text) FROM PUBLIC;
COMMIT;
