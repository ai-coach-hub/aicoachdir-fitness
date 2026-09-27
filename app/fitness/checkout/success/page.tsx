import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { grantFitnessAccess } from "@/lib/pickaxeAccess";
import { saveFitnessMembership } from "@/lib/fitnessMembershipDb";
import {
  stripeRequest,
  stripeSubscriptionIsActive,
} from "@/lib/stripeServer";

export const dynamic = "force-dynamic";

type SuccessPageProps = {
  searchParams: Promise<{ session_id?: string | string[] }>;
};

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function FitnessCheckoutSuccessPage({
  searchParams,
}: SuccessPageProps) {
  const user = await currentUser();
  if (!user) redirect("/fitness/login");

  const email = primaryEmail(user);
  if (!email) redirect("/fitness/login");

  const params = await searchParams;
  const rawSessionId = Array.isArray(params.session_id)
    ? params.session_id[0]
    : params.session_id;
  const sessionId = String(rawSessionId || "").trim();

  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    redirect("/fitness/subscribe");
  }

  let accessConfirmed = false;

  try {
    const session = await stripeRequest(
      `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    );

    const clientReferenceId = String(session.client_reference_id || "");
    const sessionEmail = String(
      record(session.customer_details).email ||
        record(session.metadata).member_email ||
        "",
    )
      .trim()
      .toLowerCase();

    if (clientReferenceId !== user.id || sessionEmail !== email) {
      throw new Error("Checkout identity did not match the signed-in member.");
    }

    const subscription = record(session.subscription);
    const subscriptionId = String(subscription.id || session.subscription || "");
    const subscriptionStatus = String(subscription.status || "");
    const customerId = String(session.customer || "");
    const paymentStatus = String(session.payment_status || "");

    if (
      !subscriptionId ||
      paymentStatus !== "paid" ||
      !stripeSubscriptionIsActive(subscriptionStatus)
    ) {
      throw new Error("Subscription is not active.");
    }

    await grantFitnessAccess(email);
    await saveFitnessMembership({
      email,
      clerkUserId: user.id,
      customerId,
      subscriptionId,
      stripeStatus: subscriptionStatus,
      active: true,
      eventType: "checkout_success_verified",
      eventId: sessionId,
    });

    accessConfirmed = true;
  } catch (error) {
    console.error("[fitness-checkout-success] verification-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (accessConfirmed) {
    redirect("/fitness/chat");
  }

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">PAYMENT VERIFICATION</p>
        <h1>We are still confirming your membership.</h1>
        <p>
          Your checkout returned successfully, but access could not be confirmed
          yet. Do not submit another payment.
        </p>
        <div className="cta-row">
          <a href="/fitness/chat" className="primary-button">
            Check Membership
          </a>
        </div>
      </section>
    </main>
  );
}
