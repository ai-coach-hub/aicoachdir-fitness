-- DRAFT ONLY. Execute on isolated Neon preview branch after review.
CREATE TABLE IF NOT EXISTS public.coach_chat_turns (
 coach TEXT NOT NULL CHECK (coach ~ '^[a-z][a-z0-9-]{1,40}$'),
 member_id TEXT NOT NULL CHECK (member_id ~ '^user_[A-Za-z0-9_-]{8,128}$'),
 thread_id TEXT NOT NULL,
 request_key TEXT NOT NULL,
 question TEXT NOT NULL,
 reply TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (coach, member_id, thread_id, request_key),
 CONSTRAINT request_key_format CHECK (request_key ~ '^[A-Za-z0-9_-]{16,100}$'),
 CONSTRAINT thread_id_format CHECK (thread_id ~ '^[a-z][a-z0-9-]{1,40}-[A-Za-z0-9_-]{8,90}$'),
 CONSTRAINT thread_prefix_matches_coach CHECK (thread_id LIKE coach || '-%'),
 CONSTRAINT question_length CHECK (char_length(question) BETWEEN 1 AND 6000),
 CONSTRAINT reply_length CHECK (char_length(reply) BETWEEN 1 AND 10000)
);
CREATE INDEX IF NOT EXISTS coach_chat_turns_recent_idx
 ON public.coach_chat_turns(coach,member_id,created_at DESC);
