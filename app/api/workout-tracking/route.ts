import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureWorkoutTrackingSchema } from "@/lib/workoutTrackingDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function getIdentity() {
  const { userId } = await auth();

  if (!userId) return null;

  const user = await currentUser();

  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) return null;

  return {
    userId,
    email: email.toLowerCase(),
  };
}

function cleanString(value: unknown, max = 250) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (!result || result.length > max) return null;
  return result;
}

function optionalString(value: unknown, max = 250) {
  if (value === null || value === undefined || value === "") return null;
  return cleanString(value, max);
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) return null;

  return number;
}

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) return null;

  return number;
}

/*
  GET /api/workout-tracking?workoutId=upper-a

  Returns the latest session and its saved sets for the
  currently authenticated user.
*/
export async function GET(request: Request) {
  const identity = await getIdentity();

  if (!identity) {
    return jsonError("Unauthorized", 401);
  }

  const requestUrl = new URL(request.url);
  const workoutId = cleanString(requestUrl.searchParams.get("workoutId"));

  if (!workoutId) {
    return jsonError("Workout ID is required.", 400);
  }

  try {
    const sql = await ensureWorkoutTrackingSchema();

    const sessions = await sql`
      SELECT
        id::text AS id,
        workout_id,
        workout_title,
        schedule_label,
        status,
        started_at,
        completed_at
      FROM workout_sessions
      WHERE clerk_user_id = ${identity.userId}
        AND workout_id = ${workoutId}
      ORDER BY
        CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END,
        COALESCE(completed_at, started_at) DESC
      LIMIT 1
    `;

    const session = sessions[0];

    if (!session) {
      return NextResponse.json(
        {
          ok: true,
          session: null,
          sets: [],
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const sets = await sql`
      SELECT
        id::text AS id,
        exercise_id,
        exercise_name,
        set_number,
        target_reps,
        actual_reps,
        weight::float8 AS weight,
        weight_unit,
        completed,
        completed_at
      FROM workout_set_entries
      WHERE session_id = ${session.id}::uuid
      ORDER BY exercise_id, set_number
    `;

    return NextResponse.json(
      {
        ok: true,
        session,
        sets,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.error("Workout tracking read failed.");
    return jsonError("Unable to load workout progress.", 500);
  }
}

/*
  POST starts a workout session.

  If this user already has an unfinished session for this
  workout, that same session is returned instead.
*/
export async function POST(request: Request) {
  const identity = await getIdentity();

  if (!identity) {
    return jsonError("Unauthorized", 401);
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const workoutId = cleanString(body.workoutId);
  const workoutTitle = cleanString(body.workoutTitle);
  const scheduleLabel = optionalString(body.scheduleLabel);

  if (!workoutId || !workoutTitle) {
    return jsonError("Workout information is incomplete.", 400);
  }

  try {
    const sql = await ensureWorkoutTrackingSchema();

    const existing = await sql`
      SELECT id::text AS id
      FROM workout_sessions
      WHERE clerk_user_id = ${identity.userId}
        AND workout_id = ${workoutId}
        AND status = 'in_progress'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    if (existing[0]?.id) {
      return NextResponse.json({
        ok: true,
        sessionId: String(existing[0].id),
        resumed: true,
      });
    }

    const sessionId = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO workout_sessions (
        id,
        clerk_user_id,
        email,
        workout_id,
        workout_title,
        schedule_label
      )
      VALUES (
        ${sessionId}::uuid,
        ${identity.userId},
        ${identity.email},
        ${workoutId},
        ${workoutTitle},
        ${scheduleLabel}
      )
      RETURNING id::text AS id
    `;

    return NextResponse.json(
      {
        ok: true,
        sessionId: String(rows[0].id),
        resumed: false,
      },
      { status: 201 }
    );
  } catch {
    console.error("Workout session creation failed.");
    return jsonError("Unable to start workout.", 500);
  }
}

/*
  PATCH supports:

  action: "save-set"
  action: "complete-workout"
*/
export async function PATCH(request: Request) {
  const identity = await getIdentity();

  if (!identity) {
    return jsonError("Unauthorized", 401);
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const action = cleanString(body.action, 50);
  const sessionId = cleanString(body.sessionId, 100);

  if (!action || !sessionId) {
    return jsonError("Missing workout information.", 400);
  }

  try {
    const sql = await ensureWorkoutTrackingSchema();

    if (action === "complete-workout") {
      const rows = await sql`
        UPDATE workout_sessions
        SET
          status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${sessionId}::uuid
          AND clerk_user_id = ${identity.userId}
          AND status = 'in_progress'
        RETURNING id::text AS id, completed_at
      `;

      if (!rows[0]) {
        return jsonError("Workout session not found.", 404);
      }

      return NextResponse.json({
        ok: true,
        completed: true,
        completedAt: rows[0].completed_at,
      });
    }

    if (action === "save-set") {
      const exerciseId = cleanString(body.exerciseId);
      const exerciseName = cleanString(body.exerciseName);
      const setNumber = optionalInteger(body.setNumber);
      const targetReps = optionalString(body.targetReps, 100);
      const actualReps = optionalInteger(body.actualReps);
      const weight = optionalNumber(body.weight);
      const completed = body.completed === true;
      const weightUnit =
        body.weightUnit === "kg" ? "kg" : "lb";

      if (!exerciseId || !exerciseName || !setNumber || setNumber < 1) {
        return jsonError("Set information is incomplete.", 400);
      }

      const setId = crypto.randomUUID();

      const rows = await sql`
        INSERT INTO workout_set_entries (
          id,
          session_id,
          exercise_id,
          exercise_name,
          set_number,
          target_reps,
          actual_reps,
          weight,
          weight_unit,
          completed,
          completed_at
        )
        SELECT
          ${setId}::uuid,
          ws.id,
          ${exerciseId},
          ${exerciseName},
          ${setNumber},
          ${targetReps},
          ${actualReps},
          ${weight},
          ${weightUnit},
          ${completed},
          CASE
            WHEN ${completed} THEN NOW()
            ELSE NULL
          END
        FROM workout_sessions ws
        WHERE ws.id = ${sessionId}::uuid
          AND ws.clerk_user_id = ${identity.userId}
          AND ws.status = 'in_progress'
        ON CONFLICT (session_id, exercise_id, set_number)
        DO UPDATE SET
          actual_reps = EXCLUDED.actual_reps,
          weight = EXCLUDED.weight,
          weight_unit = EXCLUDED.weight_unit,
          completed = EXCLUDED.completed,
          completed_at = CASE
            WHEN EXCLUDED.completed THEN NOW()
            ELSE NULL
          END,
          updated_at = NOW()
        RETURNING
          id::text AS id,
          set_number,
          actual_reps,
          weight::float8 AS weight,
          weight_unit,
          completed,
          completed_at
      `;

      if (!rows[0]) {
        return jsonError("Workout session not found.", 404);
      }

      return NextResponse.json({
        ok: true,
        set: rows[0],
      });
    }

    return jsonError("Unsupported action.", 400);
  } catch {
    console.error("Workout tracking update failed.");
    return jsonError("Unable to save workout progress.", 500);
  }
}
