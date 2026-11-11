/**
 * Dedicated preview-only Studio identity registration for the existing
 * converted test member. Does not grant an access group, run a completion,
 * reserve usage, or unlock a previously uncertain workout-save attempt.
 * Pickaxe Studio is shared, so only the exact dedicated test identity may
 * be created here; never use this for production member provisioning.
 */
import { currentUser } from "@clerk/nextjs/server";
import { isolatedTrialPreviewEnabled } from "@/lib/isolatedIntroductoryIdentity";
import { verifiedIsolatedPaidContinuation } from "@/lib/isolatedPaidContinuation";
import { introHistorySql } from "@/lib/isolatedTrialHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://api.pickaxe.co/v1";
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function pickaxe(path: string, token: string, method: "GET" | "POST" = "GET", body?: unknown) {
  return fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

function exactEmail(record: unknown, expected: string): boolean {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const data = record as Record<string, unknown>;
  const user = data.data && typeof data.data === "object" && !Array.isArray(data.data)
    ? data.data as Record<string, unknown> : data;
  return typeof user.email === "string" && user.email.trim().toLowerCase() === expected;
}

export async function POST(request: Request) {
  if (!isolatedTrialPreviewEnabled()) return respond({ ok: false }, 404);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return respond({ ok: false, error: "Same-origin request required" }, 403);
  const user = await currentUser();
  const primary = user?.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
  const email = primary?.emailAddress.trim().toLowerCase() || "";
  if (!user || !primary || primary.verification?.status !== "verified" ||
      user.id !== String(process.env.INTRODUCTORY_TRIAL_DEDICATED_TEST_CLERK_ID || "") ||
      !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))
    return respond({ ok: false, error: "Dedicated verified test identity required" }, 403);

  const paid = await verifiedIsolatedPaidContinuation();
  if (!paid.ready || paid.clerkId !== user.id)
    return respond({ ok: false, error: "Existing isolated converted test membership required" }, 403);
  try {
    // Attest exact isolation and account ownership before writing into the shared Studio.
    const sql = await introHistorySql();
    const grants = await sql`SELECT 1 FROM public.introductory_trial_grants
      WHERE clerk_user_id=${user.id} AND converted_at IS NOT NULL LIMIT 2`;
    const members = await sql`SELECT 1 FROM public.fitness_memberships
      WHERE clerk_user_id=${user.id} AND email=${email} AND access_active=true
        AND stripe_subscription_id IS NOT NULL LIMIT 2`;
    if (grants.length !== 1 || members.length !== 1)
      return respond({ ok: false, error: "Isolated tester account does not match" }, 403);
    const token = String(process.env.PICKAXE_WORKSPACE_API_TOKEN || "").trim();
    if (!token) return respond({ ok: false, error: "Pickaxe Studio credential unavailable" }, 503);

    const encoded = encodeURIComponent(email);
    const before = await pickaxe(`/studio/user/${encoded}`, token);
    if (before.ok) {
      const record: unknown = await before.json();
      if (!exactEmail(record, email))
        return respond({ ok: false, error: "Pickaxe identity conflict; no change made" }, 409);
      return respond({ ok: true, registered: true, alreadyExisted: true, workoutRetryAllowed: false });
    }
    if (before.status !== 404)
      return respond({ ok: false, error: "Pickaxe lookup unavailable; no user created" }, 503);
    // Creation without accessGroupId avoids granting real paid Pickaxe entitlements.
    const created = await pickaxe("/studio/user/create", token, "POST", {
      email, isEmailVerified: true,
    });
    if (!created.ok && created.status !== 409)
      return respond({ ok: false, error: "Pickaxe test-user registration failed" }, 502);
    const after = await pickaxe(`/studio/user/${encoded}`, token);
    if (!after.ok || !exactEmail(await after.json(), email))
      return respond({ ok: false, error: "Pickaxe user creation could not be independently verified" }, 503);
    return respond({ ok: true, registered: true, alreadyExisted: created.status === 409, workoutRetryAllowed: false });
  } catch {
    return respond({ ok: false, error: "Identity registration could not be verified; do not retry workout save" }, 503);
  }
}
