import { neon } from '@neondatabase/serverless';
import { decideExistingHandoff } from './modify-workout-handoff-db-core.mjs';

function getConnectionString() {
  const value = process.env.STORAGE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!value) throw new Error('Modify-workout handoff database is not configured.');
  return value;
}

function getDatabase() {
  return neon(getConnectionString());
}

export async function ensureModifyWorkoutHandoffSchema() {
  const sql = getDatabase();
  await sql`
    CREATE TABLE IF NOT EXISTS modify_workout_handoffs (
      idempotency_key TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      session_id TEXT NOT NULL,
      workout_id TEXT NOT NULL,
      plan_updated_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing','succeeded','failed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS modify_workout_handoffs_expires_at_idx ON modify_workout_handoffs (expires_at)`;
  return sql;
}

export async function claimHandoff(key, email, sessionId, workoutId, planUpdatedAt) {
  const sql = await ensureModifyWorkoutHandoffSchema();
  const expiresAt = new Date(Date.now() + 90_000).toISOString();

  const claimed = await sql`
    INSERT INTO modify_workout_handoffs (
      idempotency_key, email, session_id, workout_id, plan_updated_at, status, expires_at
    ) VALUES (
      ${key}, ${email}, ${sessionId}, ${workoutId}, ${planUpdatedAt}, 'processing', ${expiresAt}
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      email = EXCLUDED.email,
      session_id = EXCLUDED.session_id,
      workout_id = EXCLUDED.workout_id,
      plan_updated_at = EXCLUDED.plan_updated_at,
      status = 'processing',
      updated_at = NOW(),
      expires_at = EXCLUDED.expires_at
    WHERE modify_workout_handoffs.status = 'failed'
       OR modify_workout_handoffs.expires_at <= NOW()
    RETURNING status, expires_at
  `;
  if (claimed.length) return 'claimed';

  const existing = await sql`
    SELECT status, expires_at
    FROM modify_workout_handoffs
    WHERE idempotency_key = ${key}
    LIMIT 1
  `;
  if (!existing.length) return 'processing';
  const decision = decideExistingHandoff(existing[0].status, existing[0].expires_at, new Date());
  if (decision === 'succeeded') return 'succeeded';
  if (decision === 'processing') return 'processing';

  const retried = await sql`
    UPDATE modify_workout_handoffs
    SET status = 'processing', updated_at = NOW(), expires_at = ${expiresAt}
    WHERE idempotency_key = ${key}
      AND (status = 'failed' OR expires_at <= NOW())
    RETURNING status
  `;
  return retried.length ? 'claimed' : 'processing';
}

export async function markHandoffSucceeded(key) {
  const sql = getDatabase();
  await sql`
    UPDATE modify_workout_handoffs
    SET status = 'succeeded', updated_at = NOW()
    WHERE idempotency_key = ${key}
  `;
}

export async function markHandoffFailed(key) {
  const sql = getDatabase();
  await sql`
    UPDATE modify_workout_handoffs
    SET status = 'failed', updated_at = NOW()
    WHERE idempotency_key = ${key}
  `;
}
