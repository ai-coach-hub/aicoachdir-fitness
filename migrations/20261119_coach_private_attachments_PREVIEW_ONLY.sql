-- Private coach attachment metadata for preview branch only.
-- NEVER run against production without separately reviewed migration and retention.
-- Attachment bytes live in a private Neon Object Storage bucket, not Postgres.
-- Expected isolated branch: br-autumn-breeze-auw38rgr
CREATE TABLE IF NOT EXISTS public.coach_chat_attachments (
  attachment_id uuid PRIMARY KEY,
  member_email text NOT NULL,
  coach text NOT NULL CHECK (coach IN ('fitness','life')),
  conversation_id text NOT NULL,
  filename text NOT NULL,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type = 'image/jpeg'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  fetch_token_hash text,
  fetch_token_expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS coach_chat_attachments_member_recent_idx
 ON public.coach_chat_attachments(member_email, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_chat_attachments_expiry_idx
 ON public.coach_chat_attachments(expires_at);
-- Deleting SQL rows is not sufficient: delete the corresponding S3 objects
-- before/alongside row removal. Never auto-prune without a verified worker.
