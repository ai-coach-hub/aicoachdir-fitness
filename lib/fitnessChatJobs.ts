import { createHash } from "node:crypto";
import { membershipDb } from "@/lib/fitnessMembershipDb";

export type FitnessJobState = "queued" | "running" | "complete" | "error" | "uncertain";

type JobRow = {
  state: FitnessJobState;
  conversation_id: string;
  request_hash: string;
  result: unknown;
  http_status: number | null;
  created_at: string;
  updated_at: string;
};

export type FitnessJob = {
  state: FitnessJobState;
  conversationId: string;
  result: Record<string, unknown> | null;
  httpStatus: number | null;
  createdAt: string;
  updatedAt: string;
};

const PRODUCTION_NEON_BRANCH_ID = "br-sparkling-glitter-aucpz59d";

function normalizeRow(row: JobRow): FitnessJob {
  return {
    state: row.state,
    conversationId: String(row.conversation_id),
    result: row.result && typeof row.result === "object" && !Array.isArray(row.result)
      ? row.result as Record<string, unknown> : null,
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function jobsDb() {
  if (process.env.VERCEL_ENV !== "production" ||
      process.env.FITNESS_RESUMABLE_CHAT_ENABLED !== "true") {
    throw new Error("Resumable Fitness chat is not enabled");
  }
  const sql = membershipDb();
  const identity = await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
  if (String(identity[0]?.branch_id || "") !== PRODUCTION_NEON_BRANCH_ID) {
    throw new Error("Resumable Fitness chat database branch mismatch");
  }
  // The table must be migrated explicitly. Never create or modify schema on a live request.
  return sql;
}

export function fitnessJobRequestHash(args: {
  message: string;
  conversationId: string;
  pendingPlanRequest: string;
  timeZone: string;
}) {
  return createHash("sha256").update(JSON.stringify(args), "utf8").digest("hex");
}

export async function claimFitnessChatJob(args: {
  email: string;
  requestKey: string;
  conversationId: string;
  requestHash: string;
}): Promise<{ created: boolean; job: FitnessJob }> {
  const sql = await jobsDb();
  const inserted = await sql`
    INSERT INTO fitness_chat_jobs (member_email, request_key, conversation_id, request_hash, state)
    VALUES (${args.email}, ${args.requestKey}, ${args.conversationId}, ${args.requestHash}, 'queued')
    ON CONFLICT (member_email, request_key) DO NOTHING
    RETURNING state, conversation_id, request_hash, result, http_status, created_at, updated_at
  `;
  const rows = inserted.length ? inserted : await sql`
    SELECT state, conversation_id, request_hash, result, http_status, created_at, updated_at
    FROM fitness_chat_jobs WHERE member_email=${args.email} AND request_key=${args.requestKey}
    LIMIT 1
  `;
  if (rows.length !== 1) throw new Error("Fitness job claim unavailable");
  const row = rows[0] as JobRow;
  if (row.request_hash !== args.requestHash || row.conversation_id !== args.conversationId) {
    throw new Error("Fitness request key was already used for a different message");
  }
  return { created: inserted.length === 1, job: normalizeRow(row) };
}

export async function startFitnessChatJob(email: string, requestKey: string) {
  const sql = await jobsDb();
  const rows = await sql`
    UPDATE fitness_chat_jobs SET state='running', updated_at=NOW()
    WHERE member_email=${email} AND request_key=${requestKey} AND state='queued'
    RETURNING request_key
  `;
  return rows.length === 1;
}

export async function finishFitnessChatJob(args: {
  email: string;
  requestKey: string;
  state: "complete" | "error" | "uncertain";
  httpStatus: number;
  result: Record<string, unknown>;
}) {
  const sql = await jobsDb();
  const rows = await sql`
    UPDATE fitness_chat_jobs
    SET state=${args.state}, http_status=${args.httpStatus},
        result=${JSON.stringify(args.result)}::jsonb, updated_at=NOW()
    WHERE member_email=${args.email} AND request_key=${args.requestKey}
      AND state='running'
    RETURNING request_key
  `;
  if (rows.length !== 1) throw new Error("Fitness job result was not persisted");
}

export async function getFitnessChatJob(email: string, requestKey: string): Promise<FitnessJob | null> {
  const sql = await jobsDb();
  const rows = await sql`
    SELECT state, conversation_id, request_hash, result, http_status, created_at, updated_at
    FROM fitness_chat_jobs WHERE member_email=${email} AND request_key=${requestKey}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const job = normalizeRow(rows[0] as JobRow);
  // A Vercel worker may have been terminated. Never automatically replay a paid request.
  const ageMs = Date.now() - Date.parse(job.createdAt);
  if ((job.state === "queued" || job.state === "running") && ageMs > 8 * 60_000) {
    return {
      ...job,
      state: "uncertain",
      httpStatus: 503,
      result: {
        ok: false,
        conversationId: job.conversationId,
        savedPlanVerified: false,
        error: "The coach's request may have finished, but its result could not be confirmed. Check My Workouts and previous chats before submitting another request.",
      },
    };
  }
  return job;
}
