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

function validRequest(v: PreviewUsageRequest): boolean {
  return Boolean(v.memberId && v.subscriptionKey && v.requestKey?.length >= 8 &&
    ["fitness","budgeting","life","career"].includes(v.coach) &&
    v.periodStart && !Number.isNaN(Date.parse(v.periodStart)));
}

export async function reservePreviewAiUse(v: PreviewUsageRequest): Promise<string> {
  if (!validRequest(v)) return "invalid";
  const sql = usageDb();
  const rows = await sql`SELECT preview_ai_reserve(
    ${v.memberId}, ${v.subscriptionKey}, ${v.periodStart}::timestamptz, ${v.requestKey}, ${v.coach}
  ) AS result`;
  return String(rows[0]?.result ?? "ineligible");
}

export async function settlePreviewAiUse(
  v: PreviewUsageRequest, outcome: "completed" | "released" | "uncertain"
): Promise<string> {
  if (!validRequest(v)) return "invalid";
  const sql = usageDb();
  const rows = await sql`SELECT preview_ai_settle(
    ${v.memberId}, ${v.subscriptionKey}, ${v.periodStart}::timestamptz, ${v.requestKey}, ${outcome}
  ) AS result`;
  return String(rows[0]?.result ?? "missing");
}

export async function reconcilePreviewAiUse(
  v: PreviewUsageRequest, outcome: "completed" | "released"
): Promise<string> {
  if (!validRequest(v)) return "invalid";
  const sql = usageDb();
  const rows = await sql`SELECT preview_ai_reconcile(
    ${v.memberId}, ${v.subscriptionKey}, ${v.periodStart}::timestamptz, ${v.requestKey}, ${outcome}
  ) AS result`;
  return String(rows[0]?.result ?? "missing");
}
