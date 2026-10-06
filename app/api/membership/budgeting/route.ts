import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(value: string) {
  const expected = String(process.env.BUDGET_MEMBERSHIP_HANDOFF_SECRET || "").trim();
  const supplied = String(value || "").trim();
  if (!expected || !supplied) return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return email.includes("@") && email.length <= 254 ? email : "";
}

export async function POST(request: Request) {
  const suppliedSecret = request.headers.get("x-budget-membership-secret") || "";
  if (!secretMatches(suppliedSecret)) {
    return NextResponse.json({ ok: false, active: false }, { status: 401 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, active: false }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, active: false }, { status: 400 });
  }

  try {
    const active = await memberHasFitnessAccess(email);
    return NextResponse.json(
      { ok: true, active },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, active: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
