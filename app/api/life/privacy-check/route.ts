import { neon } from "@neondatabase/serverless";
import { lifeTester } from "@/lib/lifeCoachAccess";
import { listLifeThreads, readLifeThread } from "@/lib/lifeCoachStore";

export const dynamic = "force-dynamic";
const SANDBOX_BRANCH = "feature/life-coach-agent-sandbox-20261011";
const NEON_BRANCH = "br-autumn-breeze-auw38rgr";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// A zero-model-request verification that each real, verified Clerk session only
// reads its own threads. This API is private preview QA, not a public feature.
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== SANDBOX_BRANCH) {
    return reply({ ok: false, error: "Not available." }, 404);
  }

  // A browser must intentionally invoke this on its own preview origin.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return reply({ ok: false, error: "Same-origin request required." }, 403);

  const member = await lifeTester();
  if (!member) return reply({ ok: false, error: "Approved verified test account required." }, 403);
  const url = process.env.LIFE_COACH_DATABASE_URL;
  if (!url) return reply({ ok: false, error: "Private database unavailable." }, 503);

  try {
    const sql = neon(url);
    const identity = await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
    if (String(identity[0]?.branch_id || "") !== NEON_BRANCH)
      return reply({ ok: false, error: "Unexpected private database branch." }, 503);

    // Obtain a foreign conversation ID solely inside the server. Neither the ID
    // nor other members' identity, messages or metadata is returned to the client.
    const foreign = await sql`SELECT foreign_threads.id
      FROM life_chat_threads AS foreign_threads
      WHERE foreign_threads.member_id <> ${member}
      AND NOT EXISTS (
        SELECT 1 FROM life_chat_threads AS own
        WHERE own.member_id = ${member} AND own.id = foreign_threads.id
      )
      ORDER BY foreign_threads.created_at DESC LIMIT 1`;
    if (!foreign.length)
      return reply({ ok: false, error: "A second test account's saved history is still needed." }, 409);

    const foreignId = String(foreign[0].id);
    const ownThreads = await listLifeThreads(member);
    if (!ownThreads.length)
      return reply({ ok: false, error: "Save a harmless test goal with Life Coach first." }, 409);
    const foreignRead = await readLifeThread(member, foreignId);
    if (foreignRead !== null || ownThreads.some(t => t.id === foreignId))
      return reply({ ok: false, error: "Account separation check failed." }, 409);

    // Record only the successful authenticated test-account ID and timestamp.
    // No passwords, messages, email addresses, or foreign conversation IDs.
    await sql`CREATE TABLE IF NOT EXISTS life_privacy_test_checks (
      member_id TEXT PRIMARY KEY,
      passed BOOLEAN NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`INSERT INTO life_privacy_test_checks (member_id, passed, checked_at)
      VALUES (${member}, TRUE, NOW())
      ON CONFLICT (member_id) DO UPDATE
      SET passed = TRUE, checked_at = NOW()`;
    const rows = await sql`SELECT COUNT(*)::integer AS verified_accounts
      FROM life_privacy_test_checks
      WHERE passed = TRUE AND checked_at > NOW() - INTERVAL '48 hours'`;
    const completed = Number(rows[0]?.verified_accounts || 0);
    return reply({
      ok: true,
      passed: true,
      ownHistoryScoped: true,
      foreignHistoryDenied: true,
      completedSessions: Math.min(completed, 2),
      twoAccountCheckComplete: completed >= 2,
      inferenceRequests: 0,
    });
  } catch {
    return reply({ ok: false, error: "Private privacy check unavailable." }, 503);
  }
}
