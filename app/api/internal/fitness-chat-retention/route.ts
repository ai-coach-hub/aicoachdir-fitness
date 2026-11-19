import { timingSafeEqual } from "node:crypto";
import { membershipDb } from "@/lib/fitnessMembershipDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRODUCTION_NEON_BRANCH_ID = "br-sparkling-glitter-aucpz59d";

// Vercel Cron calls this endpoint with Authorization: Bearer <CRON_SECRET>.
// A missing secret always rejects; never leave a publicly callable purge.
function authorizedCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret || configuredSecret.length < 24) return false;

  const expected = Buffer.from(`Bearer ${configuredSecret}`, "utf8");
  const supplied = Buffer.from(request.headers.get("authorization") || "", "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production" ||
      process.env.FITNESS_RESUMABLE_CHAT_ENABLED !== "true") {
    return Response.json({ ok: false, error: "Cleanup is disabled." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!authorizedCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const sql = membershipDb();
    const identity = await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
    if (String(identity[0]?.branch_id || "") !== PRODUCTION_NEON_BRANCH_ID) {
      return Response.json({ ok: false, error: "Database branch mismatch." }, { status: 503 });
    }

    // An eight-minute abandoned job is surfaced as uncertain without replay;
    // a seven-day-old job cannot be an active background computation.
    // Never touch authoritative plans, completion history, or memberships.
    // Bounded batch: daily cron handles up to 5,000 expired requests.
    const expired = await sql`
      WITH expired_keys AS (
        SELECT member_email, request_key
        FROM public.fitness_chat_jobs
        WHERE created_at < NOW() - INTERVAL '7 days'
        ORDER BY created_at, member_email, request_key
        LIMIT 5000
      )
      DELETE FROM public.fitness_chat_jobs AS jobs
      USING expired_keys AS expired
      WHERE jobs.member_email = expired.member_email
        AND jobs.request_key = expired.request_key
      RETURNING jobs.request_key
    `;
    return Response.json({ ok: true, deleted: expired.length },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[fitness-chat-retention] cleanup failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ ok: false, error: "Cleanup unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
