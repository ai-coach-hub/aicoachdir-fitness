import { currentUser } from "@clerk/nextjs/server";
import { canonicalMemberEmail } from "@/lib/memberIdentity";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import { getFitnessChatJob } from "@/lib/fitnessChatJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production" ||
      process.env.FITNESS_RESUMABLE_CHAT_ENABLED !== "true") {
    return Response.json({ ok: false, error: "Resumable Fitness chat is not enabled." }, { status: 404 });
  }

  const user = await currentUser();
  const primary = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
  const memberEmail = primary?.verification?.status === "verified"
    ? canonicalMemberEmail(primary.emailAddress) : "";
  if (!user || !memberEmail) {
    return Response.json({ ok: false, error: "Verified member sign-in required." }, { status: 401 });
  }
  try {
    if (!(await memberHasFitnessAccess(memberEmail, user.id))) {
      return Response.json({ ok: false, error: "Active Fitness membership required." }, { status: 403 });
    }
  } catch {
    return Response.json({ ok: false, error: "Fitness membership verification unavailable." }, { status: 503 });
  }

  const requestKey = new URL(request.url).searchParams.get("job") || "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) {
    return Response.json({ ok: false, error: "Valid request ID required." }, { status: 400 });
  }
  try {
    const job = await getFitnessChatJob(memberEmail, requestKey);
    if (!job) return Response.json({ ok: false, error: "Request not found." }, { status: 404 });
    return Response.json({
      ok: true,
      jobState: job.state,
      conversationId: job.conversationId,
      httpStatus: job.httpStatus,
      result: job.result,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Could not check pending request. Do not resend." }, { status: 503 });
  }
}
