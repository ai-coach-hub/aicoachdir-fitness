import { neon } from "@neondatabase/serverless";

function getConnectionString() {
  const connectionString =
    process.env.STORAGE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("Terms acceptance database is not configured.");
  }

  return connectionString;
}

export function getTermsDatabase() {
  return neon(getConnectionString());
}

export async function ensureTermsAcceptanceSchema() {
  const sql = getTermsDatabase();

  await sql`
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
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS terms_acceptances_email_idx ON terms_acceptances (email)`;
  await sql`CREATE INDEX IF NOT EXISTS terms_acceptances_accepted_at_idx ON terms_acceptances (accepted_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS terms_acceptances_terms_version_idx ON terms_acceptances (terms_version)`;

  return sql;
}
