import { neon } from "@neondatabase/serverless";

// Preview-only adapter. Not connected to coach requests or production subscriptions.
// All identity, billing-period, and request values must come from trusted server code.
export type AiUsageCoach = "fitness" | "budgeting" | "life" | "career";
export type PreviewUsageRequest = {
  memberId: string;
  subscriptionKey: string;
  periodStart: string;
  requestKey: string;
  coach: AiUsageCoach;
};

function usageDb() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "feature/life-coach-agent-sandbox-20261011" ||
      process.env.PREVIEW_SHARED_USAGE_METER_ENABLED !== "true") {
    throw new Error("Preview usage meter is disabled");
  }
  const url = process.env.LIFE_COACH_DATABASE_URL;
  if (!url) throw new Error("Private preview database not configured");
  return neon(url);
}

async function verifiedUsageDb() {
  const sql = usageDb();
  // Confirm the isolated Neon branch before any usage reservation or settlement.
  const branch = await sql`SELECT current_setting('neon.branch_id', true) AS branch_id`;
  if (String(branch[0]?.branch_id || "") !== "br-autumn-breeze-auw38rgr") {
    throw new Error("Private usage meter database branch mismatch");
  }
  return sql;
}

function validRequest(v: PreviewUsageRequest): boolean {
  return Boolean(
    typeof v.memberId === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(v.memberId) &&
    typeof v.subscriptionKey === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(v.subscriptionKey) &&
    typeof v.requestKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(v.requestKey) &&
    ["fitness","budgeting","life","career"].includes(v.coach) &&
    typeof v.periodStart === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.periodStart) &&
    !Number.isNaN(Date.parse(v.periodStart)) &&
    new Date(v.periodStart).toISOString() === v.periodStart
  );
}

export async function reservePreviewAiUse(v: PreviewUsageRequest): Promise<string> {
  if (!validRequest(v)) return "invalid";
  const sql = await verifiedUsageDb();
  const rows = await sql`SELECT preview_ai_reserve(
    ${v.memberId}, ${v.subscriptionKey}, ${v.periodStart}::timestamptz, ${v.requestKey}, ${v.coach}
  ) AS result`;
  return String(rows[0]?.result ?? "ineligible");
}

export async function settlePreviewAiUse(
  v: PreviewUsageRequest, outcome: "completed" | "released" | "uncertain"
): Promise<string> {
  if (!validRequest(v)) return "invalid";
  const sql = await verifiedUsageDb();
  const rows = await sql`SELECT preview_ai_settle(
    ${v.memberId}, ${v.subscriptionKey}, ${v.periodStart}::timestamptz, ${v.requestKey}, ${outcome}
  ) AS result`;
  return String(rows[0]?.result ?? "missing");
}

export async function reconcilePreviewAiUse(
  v: PreviewUsageRequest, outcome: "completed" | "released"
): Promise<string> {
  if (!validRequest(v)) return "invalid";
  const sql = await verifiedUsageDb();
  const rows = await sql`SELECT preview_ai_reconcile(
    ${v.memberId}, ${v.subscriptionKey}, ${v.periodStart}::timestamptz, ${v.requestKey}, ${outcome}
  ) AS result`;
  return String(rows[0]?.result ?? "missing");
}
