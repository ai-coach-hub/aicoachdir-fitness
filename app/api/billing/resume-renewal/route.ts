import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getFitnessMembership, refreshLinkedMembershipStatus } from "@/lib/fitnessMembershipDb";
import { getVerifiedSubscription } from "@/lib/stripeMembershipState";
import { stripeRequest } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectManage(origin: string, status: string) {
  const url = new URL("/manage-subscription", origin);
  url.searchParams.set("renewal", status);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }

  const user = await currentUser();
  const primary = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
    || user?.emailAddresses[0];
  const email = String(primary?.emailAddress || "").trim().toLowerCase();
  if (!user || !email || primary?.verification?.status !== "verified") {
    return redirectManage(origin, "sign-in-required");
  }

  try {
    const saved = await getFitnessMembership(email);
    if (!saved ||
        String(saved.clerk_user_id || "") !== user.id ||
        !saved.stripe_customer_id || !saved.stripe_subscription_id) {
      return redirectManage(origin, "unavailable");
    }
    const live = await getVerifiedSubscription({
      customerId: String(saved.stripe_customer_id),
      subscriptionId: String(saved.stripe_subscription_id),
      memberEmail: email,
    });

    // Cannot reactivate a subscription after its paid period has expired.
    // A new Checkout session is required in that case.
    if (!live || live.state === "canceled" || live.state === "recoverable") {
      return redirectManage(origin, "cannot-resume");
    }
    if (live.state === "active") {
      return redirectManage(origin, "already-active");
    }
    if (live.state !== "canceling" || !live.cancelAtPeriodEnd) {
      return redirectManage(origin, "unavailable");
    }

    const params = new URLSearchParams();
    params.set("cancel_at_period_end", "false");
    await stripeRequest(
      `/subscriptions/${encodeURIComponent(live.subscriptionId)}`,
      { method: "POST", body: params },
    );

    const verified = await getVerifiedSubscription({
      customerId: live.customerId,
      subscriptionId: live.subscriptionId,
      memberEmail: email,
    });
    if (!verified || verified.state !== "active") {
      return redirectManage(origin, "pending");
    }

    await refreshLinkedMembershipStatus(email, { force: true });
    return redirectManage(origin, "resumed");
  } catch (error) {
    console.error("[billing] resume-renewal-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return redirectManage(origin, "unavailable");
  }
}
