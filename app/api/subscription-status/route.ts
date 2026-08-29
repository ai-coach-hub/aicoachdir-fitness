import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { verifyFitnessAccess } from "@/lib/pickaxeMembership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return noStoreJson(
      { ok: false, authenticated: false, hasPaidAccess: false },
      401
    );
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  if (!email) {
    return noStoreJson(
      {
        ok: false,
        authenticated: true,
        hasPaidAccess: false,
        error: "No verified email found",
      },
      400
    );
  }

  const membership = await verifyFitnessAccess(email);

  if (!membership.ok && membership.reason === "server_configuration") {
    return noStoreJson(
      {
        ok: false,
        authenticated: true,
        email: membership.email,
        hasPaidAccess: false,
        reason: membership.reason,
        error: "Server configuration error",
      },
      500
    );
  }

  if (!membership.ok) {
    return noStoreJson(
      {
        ok: false,
        authenticated: true,
        email: membership.email,
        hasPaidAccess: false,
        reason: membership.reason,
        error: "Unable to verify membership",
      },
      502
    );
  }

  return noStoreJson({
    ok: true,
    authenticated: true,
    email: membership.email,
    hasPaidAccess: membership.hasFitnessAccess,
    reason: membership.reason,
    verificationMethod: membership.verificationMethod,
    accessSummary: membership.accessSummary,
  });
}
