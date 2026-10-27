import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { memberHasFitnessAccess } from "./fitnessMembershipDb";
import { COACH_CATALOG } from "./coachLaunchCatalog.mjs";
import { coachLaunchReadiness } from "./coachLaunchReadiness.mjs";

/**
 * Reusable *server-side* member gate for NEW coaches. This is not a substitute
 * for a coach's own route, saved-work ownership, or atomic usage reservation.
 * Existing Fitness, Budgeting and Life routes remain untouched.
 *
 * In particular, registration in the public coach catalog cannot open access:
 * unknown/unreleased coaches fail closed before any paid membership lookups.
 */
export async function authorizeNewCoachLaunch(
  slug: string,
  checks: Record<string, boolean> | undefined,
): Promise<{ ok: true; memberId: string; memberEmail: string } | { ok: false; reason: "unreleased" | "signin" | "unverified" | "inactive" | "unavailable" }> {
  const entry = COACH_CATALOG.find((coach) => coach.slug === slug);
  if (!entry || entry.availability !== "member" || entry.releaseGate !== "existing" ||
      !entry.href || !coachLaunchReadiness(checks).ready) {
    return { ok: false, reason: "unreleased" };
  }
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signin" };
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") {
    return { ok: false, reason: "unverified" };
  }
  const memberEmail = primary.emailAddress.trim().toLowerCase();
  if (!memberEmail) return { ok: false, reason: "unverified" };
  try {
    const allowed = await memberHasFitnessAccess(memberEmail, user.id, { fallbackToPickaxeList: false });
    if (!allowed) return { ok: false, reason: "inactive" };
    return { ok: true, memberId: user.id, memberEmail };
  } catch {
    // A transient provider/database error must never grant access.
    return { ok: false, reason: "unavailable" };
  }
}
