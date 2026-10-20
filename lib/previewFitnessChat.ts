import { currentUser } from "@clerk/nextjs/server";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import { lifeTester } from "@/lib/lifeCoachAccess";
import { lifeTestStatus, previewLifeTestPeriod, previewLifeTestSubscription } from "@/lib/previewLifeTestEnrollment";
import { reservePreviewAiUse, settlePreviewAiUse } from "@/lib/previewAiUsage";
import { runMeteredPreviewGeneration } from "@/lib/previewLifeUsageFlow";

// The real Fitness handler remains the source of truth for subscription access,
// saved-plan verification and provider error handling. This opt-in adapter runs
// exclusively on the private sandbox branch for approved, enrolled Life testers.
export async function previewFitnessChat(
  request: Request,
  existingFitnessHandler: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "feature/life-coach-agent-sandbox-20261011" ||
      process.env.PREVIEW_SHARED_USAGE_METER_ENABLED !== "true") {
    return existingFitnessHandler(request);
  }

  // Workout-completion recording is not a model-backed chat request.
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.clone().json();
    body = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  } catch {
    return existingFitnessHandler(request);
  }
  if (body.action === "complete_workout" || body.action === "sync_completed_workout") {
    return Response.json({ ok: false, error: "Workout completion changes are disabled in this private test." }, { status: 403 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ ok: false, error: "A valid message is required." }, { status: 400 });
  }

  // Private QA must never change real Pickaxe workout plans. The standalone
  // conversation path remains testable; mutation requests are deliberately
  // blocked until provider data is isolated as well.
  if (/\\b(?:create|make|build|generate|save|update|modify|change|replace|shift|move|reschedule|add|remove|delete|sync)\\b[\\s\\S]{0,90}\\b(?:workout|workouts|plan|schedule|my workouts)\\b/i.test(body.message)) {
    return Response.json({ ok: false, error: "Workout-plan changes are disabled in this private test to protect your saved workouts." }, { status: 403 });
  }

  const member = await lifeTester();
  if (!member) return Response.json({ ok: false, error: "Private Fitness test access required." }, { status: 403 });

  let enrollment: Awaited<ReturnType<typeof lifeTestStatus>>;
  try {
    enrollment = await lifeTestStatus(member);
  } catch {
    // Approved preview testers cannot bypass an unavailable preview meter.
    return Response.json({ ok: false, error: "Private usage verification is temporarily unavailable." }, { status: 503 });
  }
  if (!enrollment.active) return Response.json({ ok: false, error: "Private usage test enrollment is required." }, { status: 403 });

  // Verify real Fitness entitlement before reserving the synthetic preview slot.
  // Unsubscribed Life testers must not spend a slot on an inaccessible coach.
  try {
    const user = await currentUser();
    const primary = user?.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
    if (!user || !primary || user.id !== member ||
        !(await memberHasFitnessAccess(primary.emailAddress.trim().toLowerCase(), user.id))) {
      return Response.json({ ok: false, error: "An active Fitness Coach membership is required." }, { status: 403 });
    }
  } catch {
    return Response.json({ ok: false, error: "Fitness membership verification is temporarily unavailable." }, { status: 503 });
  }

  const requestKey = typeof body.requestKey === "string" ? body.requestKey.trim() : "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) {
    return Response.json({ ok: false, error: "A valid private usage request ID is required." }, { status: 400 });
  }

  const usage = {
    memberId: member,
    subscriptionKey: previewLifeTestSubscription,
    periodStart: previewLifeTestPeriod,
    requestKey,
    coach: "fitness" as const,
  };
  try {
    const result = await runMeteredPreviewGeneration({
      reserve: () => reservePreviewAiUse(usage),
      settle: (outcome) => settlePreviewAiUse(usage, outcome),
    }, async () => {
      const response = await existingFitnessHandler(request);
      const payload: unknown = await response.clone().json().catch(() => null);
      const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      // Once the handler was invoked, an unverified error may follow a provider
      // attempt or a workout Action. Hold the reservation for reconciliation.
      if (!response.ok || value.ok !== true || typeof value.response !== "string" || !value.response.trim()) {
        throw new Error("Fitness response was not a confirmed generation");
      }
      return { kind: "generated" as const, value: response };
    });
    if (result.status === "completed") return result.value;
    if (result.status === "blocked") {
      const exhausted = result.reason === "exhausted";
      return Response.json({
        ok: false,
        error: exhausted ? "Private test allowance reached." :
          result.reason.startsWith("duplicate_") ? "This request was already submitted." :
          "Private usage test not available.",
      }, { status: exhausted ? 429 : 409 });
    }
    return Response.json({
      ok: false,
      error: "The private test could not confirm this Fitness request. Please do not retry yet.",
    }, { status: 503 });
  } catch {
    return Response.json({ ok: false, error: "Private usage meter is temporarily unavailable." }, { status: 503 });
  }
}
