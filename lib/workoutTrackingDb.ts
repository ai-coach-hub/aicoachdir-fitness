import { neon } from "@neondatabase/serverless";

function getConnectionString() {
  const connectionString =
    process.env.STORAGE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("Workout tracking database is not configured.");
  }

  return connectionString;
}

export function getWorkoutDatabase() {
  return neon(getConnectionString());
}

export async function ensureWorkoutTrackingSchema() {
  const sql = getWorkoutDatabase();

  await sql`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id UUID PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      email TEXT NOT NULL,

      workout_id TEXT NOT NULL,
      workout_title TEXT NOT NULL,
      schedule_label TEXT,

      status TEXT NOT NULL DEFAULT 'in_progress',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT workout_sessions_status_check
        CHECK (status IN ('in_progress', 'completed', 'abandoned'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workout_set_entries (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL
        REFERENCES workout_sessions(id)
        ON DELETE CASCADE,

      exercise_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      set_number INTEGER NOT NULL,

      target_reps TEXT,
      actual_reps INTEGER,
      weight NUMERIC(8,2),
      weight_unit TEXT NOT NULL DEFAULT 'lb',

      completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT workout_set_number_check
        CHECK (set_number > 0),

      CONSTRAINT workout_set_reps_check
        CHECK (actual_reps IS NULL OR actual_reps >= 0),

      CONSTRAINT workout_set_weight_check
        CHECK (weight IS NULL OR weight >= 0),

      CONSTRAINT workout_set_unique
        UNIQUE (session_id, exercise_id, set_number)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS workout_sessions_user_idx
    ON workout_sessions (clerk_user_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS workout_sessions_completed_idx
    ON workout_sessions (clerk_user_id, completed_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS workout_set_entries_session_idx
    ON workout_set_entries (session_id)
  `;

  return sql;
}
