import { lifeTester } from "@/lib/lifeCoachAccess";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
const expected = "br-autumn-breeze-auw38rgr";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

// Diagnostic only: no writes, no credentials in output, no usage enforcement.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "feature/life-coach-agent-sandbox-20261011")
    return json({ ok: false, error: "Not available" }, 404);
  if (!await lifeTester()) return json({ ok: false, error: "Not authorized" }, 403);
  const connection = process.env.LIFE_COACH_DATABASE_URL;
  if (!connection) return json({ ok: false, error: "Preview database not configured" }, 503);
  try {
    const db = neon(connection);
    const rows = await db`SELECT current_setting('neon.branch_id', true) AS branch_id`;
    const actual = String(rows[0]?.branch_id || "");
    if (!actual) return json({ ok: false, error: "Database identity unavailable" }, 503);
    return json({ ok: actual === expected, matchesExpectedPreview: actual === expected,
      expectedBranch: expected, actualBranch: actual }, actual === expected ? 200 : 409);
  } catch {
    return json({ ok: false, error: "Preview database identity check failed" }, 503);
  }
}
