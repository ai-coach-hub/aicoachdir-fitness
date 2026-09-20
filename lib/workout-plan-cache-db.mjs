import { neon } from '@neondatabase/serverless';

function getConnectionString() {
  const value =
    process.env.STORAGE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    '';
  if (!value) throw new Error('Workout-plan cache database is not configured.');
  return value;
}

function getDatabase() {
  return neon(getConnectionString());
}

export async function ensureWorkoutPlanCacheSchema() {
  const sql = getDatabase();
  await sql`
    CREATE TABLE IF NOT EXISTS workout_plan_cache (
      email TEXT PRIMARY KEY,
      plan_json JSONB NOT NULL,
      entries_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      plan_updated_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  return sql;
}

function newestPlanUpdatedAt(plan) {
  const candidates = [
    plan?.updatedAt,
    plan?.nextPlan?.plan?.updatedAt,
  ]
    .filter((value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime()))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return candidates[0] || null;
}

export async function readWorkoutPlanCache(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const sql = await ensureWorkoutPlanCacheSchema();
  const rows = await sql`
    SELECT plan_json, entries_json, updated_at
    FROM workout_plan_cache
    WHERE email = ${normalizedEmail}
    LIMIT 1
  `;
  if (!rows.length) return null;

  return {
    plan: rows[0].plan_json,
    entries: Array.isArray(rows[0].entries_json) ? rows[0].entries_json : [],
    cacheUpdatedAt: rows[0].updated_at || null,
  };
}

export async function writeWorkoutPlanCache(email, plan, entries = []) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return;
  }

  const sql = await ensureWorkoutPlanCacheSchema();
  const planUpdatedAt = newestPlanUpdatedAt(plan);
  const safeEntries = Array.isArray(entries) ? entries : [];

  await sql`
    INSERT INTO workout_plan_cache (
      email, plan_json, entries_json, plan_updated_at, updated_at
    ) VALUES (
      ${normalizedEmail},
      ${JSON.stringify(plan)}::jsonb,
      ${JSON.stringify(safeEntries)}::jsonb,
      ${planUpdatedAt},
      NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
      plan_json = EXCLUDED.plan_json,
      entries_json = EXCLUDED.entries_json,
      plan_updated_at = EXCLUDED.plan_updated_at,
      updated_at = NOW()
  `;
}
