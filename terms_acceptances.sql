-- Reference schema for the durable Terms acceptance evidence table.
-- The application also creates this table/indexes with IF NOT EXISTS on first use.
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_accepted_at TIMESTAMPTZ NOT NULL,
  terms_version TEXT NOT NULL,
  acceptance_text TEXT NOT NULL,
  plan TEXT NOT NULL,
  price TEXT NOT NULL,
  included_uses INTEGER NOT NULL,
  terms_url TEXT NOT NULL,
  source_path TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  vercel_git_commit_sha TEXT,
  vercel_deployment_id TEXT
);

CREATE INDEX IF NOT EXISTS terms_acceptances_email_idx ON terms_acceptances (email);
CREATE INDEX IF NOT EXISTS terms_acceptances_accepted_at_idx ON terms_acceptances (accepted_at DESC);
CREATE INDEX IF NOT EXISTS terms_acceptances_terms_version_idx ON terms_acceptances (terms_version);
