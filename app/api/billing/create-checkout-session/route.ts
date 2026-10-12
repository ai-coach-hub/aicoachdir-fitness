import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { currentMembershipTermsId } from "@/lib/currentMembershipTerms";
import {
  getFitnessMembership,
  memberHasFitnessAccess,
  saveFitnessMembership,
  restoreVerifiedHistoricalBillingForMember,
} from "@/lib/fitnessMembershipDb";
import { grantFitnessAccess } from "@/lib/pickaxeAccess";
import { reserveCheckout, rememberCheckoutSession } from "@/lib/stripeCheckoutReservations";
import { checkCheckoutRisk, stripeRecord } from "@/lib/stripeMembershipState";
import {
  ensureStripeBillingResources,
  stripeConfigured,
  stripeRequest,
  stripeSubscriptionIsActive,
} from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkoutProblem(error: string, status: number, actionUrl?: string, actionLabel?: string) {
  return NextResponse.json(
    { ok: false, error, ...(actionUrl && actionLabel ? { actionUrl, actionLabel } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let destination: "fitness" | "budget-coach" = "fitness";
  try {
    const payload = (await request.json()) as { destination?: unknown };
    if (payload.destination === "budget-coach") destination = "budget-coach";
  } catch {
    // Fitness is the default destination.
  }

  const destinationQuery = destination;
  const destinationUrl = destination === "budget-coach"
    ? "/budgeting/launch?destination=coach"
    : "/fitness/chat";

  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
    || user?.emailAddresses[0];
  const email = String(primaryEmail?.emailAddress || "").trim().toLowerCase();

  if (!user || !email || primaryEmail?.verification?.status !== "verified") {
    return checkoutProblem("A verified member login is required before billing.", 401,
      `/fitness/login?destination=${destinationQuery}`, "Member Login");
  }

  try {
    await restoreVerifiedHistoricalBillingForMember(email, user.id);
    if (await memberHasFitnessAccess(email, user.id, { fallbackToPickaxeList: false })) {
      return NextResponse.json(
        { ok: true, alreadyActive: true, url: destinationUrl },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    return checkoutProblem(
      "We could not verify your current AI Coach Directory membership. No charge was attempted.",
      503,
    );
  }

  if (!stripeConfigured()) {
    return checkoutProblem("Secure checkout is temporarily unavailable. No charge was attempted.", 503);
  }

  let acceptanceId = "";
  try {
    acceptanceId = await currentMembershipTermsId(email);
  } catch {
    return checkoutProblem("We could not verify your Terms acceptance. No charge was attempted.", 503);
  }
  if (!acceptanceId) {
    return checkoutProblem(
      "Please review and accept the current Terms before subscribing.",
      409, `/fitness/signup?destination=${destinationQuery}`, "Review & Accept Terms",
    );
  }

  try {
    const origin = new URL(request.url).origin;
    const { priceId } = await ensureStripeBillingResources(origin);
    const existing = await getFitnessMembership(email);
    const storedCustomerId = String(existing?.stripe_customer_id || "");

    // Check every Stripe customer verified with this email, not only the
    // current database row. Old Pickaxe checkouts also used this Stripe account.
    const risk = await checkCheckoutRisk(email, storedCustomerId);
    if (risk.kind === "active") {
      // Reconcile only the SAME authenticated subscriber's saved subscription,
      // never grant access based only on a Stripe customer's email.
      const savedSubscriptionId = String(existing?.stripe_subscription_id || "");
      if (savedSubscriptionId === risk.subscriptionId
          && storedCustomerId === risk.customerId
          && String(existing?.clerk_user_id || "") === user.id) {
        const current = stripeRecord(await stripeRequest(
          `/subscriptions/${encodeURIComponent(savedSubscriptionId)}`,
        ));
        if (stripeSubscriptionIsActive(current.status)
            && String(current.customer || "") === storedCustomerId) {
          await saveFitnessMembership({
            email, clerkUserId: user.id, customerId: storedCustomerId,
            subscriptionId: savedSubscriptionId,
            stripeStatus: String(current.status || ""), active: true,
            eventType: "billing_checkout_reconciled",
          });
          try { await grantFitnessAccess(email); } catch {
            // Local membership is authoritative; a later login can retry Pickaxe.
          }
          return NextResponse.json(
            { ok: true, alreadyActive: true, url: destinationUrl },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
      }
      return checkoutProblem(
        "An active subscription already exists for this email. We will not charge you twice. Sign in with your original membership or contact support to reconnect billing.",
        409, "/manage-subscription", "Check Existing Membership",
      );
    }

    if (risk.kind === "recoverable") {
      return checkoutProblem(
        "Your existing subscription has a payment issue. Please update your billing information or resolve the outstanding payment instead of starting a second subscription.",
        409, "/manage-subscription", "Fix Existing Payment",
      );
    }

    const reservation = await reserveCheckout({
      email, clerkUserId: user.id, termsAcceptanceId: acceptanceId, destination,
    });

    if (reservation.sessionId) {
      const saved = await stripeRequest(
        `/checkout/sessions/${encodeURIComponent(reservation.sessionId)}`,
      );
      const metadata = stripeRecord(saved.metadata);
      if (String(metadata.clerk_user_id || "") !== user.id ||
          String(metadata.member_email || "").trim().toLowerCase() !== email) {
        throw new Error("A prior checkout does not match this member.");
      }
      if (saved.status === "open" && reservation.checkoutUrl.startsWith("https://checkout.stripe.com/")) {
        return NextResponse.json(
          { ok: true, alreadyActive: false, url: reservation.checkoutUrl },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return checkoutProblem(
        "A previous checkout has completed or expired. Please check your membership before attempting another payment.",
        409, "/fitness/login", "Check Membership",
      );
    }

    if (reservation.stripeExpiresAt - Math.floor(Date.now() / 1000) < 30 * 60) {
      return checkoutProblem(
        "Your previous checkout attempt is expiring. Please try again shortly. No charge was attempted.",
        409,
      );
    }

    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    if (risk.customerId) {
      body.set("customer", risk.customerId);
    } else {
      body.set("customer_email", email);
    }
    body.set("client_reference_id", user.id);
    body.set("expires_at", String(reservation.stripeExpiresAt));
    body.set("success_url",
      `${origin}/fitness/checkout/success?session_id={CHECKOUT_SESSION_ID}&destination=${reservation.destination}`);
    body.set("cancel_url",
      `${origin}/fitness/subscribe?destination=${reservation.destination}`);
    body.set("metadata[member_email]", email);
    body.set("metadata[clerk_user_id]", user.id);
    body.set("metadata[terms_acceptance_id]", reservation.termsAcceptanceId);
    body.set("subscription_data[metadata][member_email]", email);
    body.set("subscription_data[metadata][clerk_user_id]", user.id);
    body.set("subscription_data[metadata][terms_acceptance_id]", reservation.termsAcceptanceId);

    const session = await stripeRequest("/checkout/sessions", {
      method: "POST", body,
      idempotencyKey: `aicoachdir-fitness-checkout-${reservation.attemptId}`,
    });

    const sessionId = String(session.id || "");
    const checkoutUrl = String(session.url || "");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) ||
        !checkoutUrl.startsWith("https://checkout.stripe.com/")) {
      throw new Error("Stripe returned an invalid Checkout session.");
    }

    await rememberCheckoutSession(reservation, sessionId, checkoutUrl);
    return NextResponse.json(
      { ok: true, alreadyActive: false, url: checkoutUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[fitness-checkout] safe-checkout-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return checkoutProblem(
      "We couldn't safely confirm billing or open checkout. No new payment was initiated by this request. Please retry, or contact support if the issue continues.",
      503,
    );
  }
}
