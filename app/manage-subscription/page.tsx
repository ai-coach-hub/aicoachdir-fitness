import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import SiteHeader from "@/components/SiteHeader";
import {
  getFitnessMembership,
  memberHasFitnessAccess,
  refreshLinkedMembershipStatus,
} from "@/lib/fitnessMembershipDb";
import { linkVerifiedLegacyStripeMembership } from "@/lib/legacyStripeMembership";
import { classifyStripeSubscription, getVerifiedSubscription } from "@/lib/stripeMembershipState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage Subscription | AI Coach Directory",
  robots: { index: false, follow: false },
};

const supportEmail = "Ai.coach.hub.domain@gmail.com";

type ManageSubscriptionProps = {
  searchParams: Promise<{ renewal?: string | string[] }>;
};

export default async function ManageSubscriptionPage({ searchParams }: ManageSubscriptionProps) {
  const user = await currentUser();
  const primaryAddress = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
    || user?.emailAddresses[0];
  const email = String(primaryAddress?.emailAddress || "").trim().toLowerCase();
  const emailVerified = primaryAddress?.verification?.status === "verified";

  let billingState: ReturnType<typeof classifyStripeSubscription> | "unlinked" = "unlinked";
  let hasStripeBilling = false;
  let lookupFailed = false;
  let linkedMember = false;
  let canResume = false;

  if (email && user && emailVerified) {
    try {
      let member = await getFitnessMembership(email);
      if (!member || (member.access_active === true && String(member.clerk_user_id || "") !== user.id)) {
        await memberHasFitnessAccess(email, user.id);
        member = await getFitnessMembership(email);
      }
      if (member?.access_active === true && !member.stripe_customer_id) {
        member = (await linkVerifiedLegacyStripeMembership(email, user.id)) || member;
      }

      // Payment processing remains in Stripe. A stale Pickaxe access group
      // must not override an already linked, ended subscription.
      if (member?.stripe_customer_id && member.stripe_subscription_id) {
        member = (await refreshLinkedMembershipStatus(email, { force: true })) || member;
        linkedMember = String(member.clerk_user_id || "") === user.id;
        if (linkedMember) {
          const live = await getVerifiedSubscription({
            customerId: String(member.stripe_customer_id),
            subscriptionId: String(member.stripe_subscription_id),
            memberEmail: email,
          });
          if (live) {
            billingState = live.state;
            canResume = live.state === "canceling" && live.cancelAtPeriodEnd;
          }
        }
      }
      hasStripeBilling = linkedMember && !!member?.stripe_customer_id;
    } catch (error) {
      console.error("[billing-management] lookup-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      lookupFailed = true;
    }
  }

  const params = await searchParams;
  const renewalMessage = Array.isArray(params.renewal) ? params.renewal[0] : params.renewal;
  const statusMessage = renewalMessage === "resumed" && billingState === "active"
    ? "Automatic renewal has been restored. Your existing subscription remains in place."
    : renewalMessage === "already-active" && billingState === "active"
      ? "Your subscription is already renewing automatically."
      : renewalMessage === "pending"
        ? "Stripe is still confirming this change. Please check again shortly."
        : renewalMessage && renewalMessage !== "resumed" && renewalMessage !== "already-active"
          ? "We couldn't confirm the requested change. Your existing billing status has not been replaced."
          : "";

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card" aria-labelledby="subscription-heading">
        <p className="eyebrow">ACCOUNT</p>
        <h1 id="subscription-heading">Manage Subscription</h1>
        <p>Manage renewal, payment methods, or cancellation using the same AI Coach Directory login. Cancellation keeps paid access through the end of the billing period.</p>
        {!user ? (
          <p><Link href="/fitness/login">Sign in</Link> with your existing member account.</p>
        ) : !emailVerified ? (
          <p>Please verify the email on your member login to manage Stripe billing securely.</p>
        ) : (
          <>
            {statusMessage ? <p role="status">{statusMessage}</p> : null}

            {billingState === "canceling" ? (
              <>
                <p><strong>Cancellation scheduled.</strong> Your subscription is still active through the paid period. You can restore renewal without paying again now.</p>
                {canResume ? (
                  <form method="post" action="/api/billing/resume-renewal">
                    <button className="primary-button" type="submit">Resume Automatic Renewal</button>
                  </form>
                ) : null}
              </>
            ) : billingState === "active" ? (
              <p><strong>Membership active.</strong> Your subscription is currently set to renew automatically.</p>
            ) : billingState === "recoverable" ? (
              <p><strong>Payment needs attention.</strong> Update your payment method or pay the outstanding invoice on your existing subscription. Do not start another subscription.</p>
            ) : billingState === "canceled" ? (
              <>
                <p><strong>Subscription ended.</strong> You can rejoin using this same account. Your saved coaching records remain associated with this login.</p>
                <div className="cta-row">
                  <Link href="/fitness/subscribe?destination=fitness" className="primary-button">Reactivate Membership</Link>
                </div>
              </>
            ) : null}

            {hasStripeBilling ? (
              <form method="post" action="/api/billing/customer-portal">
                <button className="secondary-button" type="submit">
                  {billingState === "recoverable" ? "Fix Payment in Secure Billing" : "Open Secure Billing Management"}
                </button>
              </form>
            ) : null}

            {billingState === "unlinked" || lookupFailed ? (
              <p>
                {lookupFailed
                  ? "We couldn't load your billing details right now. No payment was attempted."
                  : "We need to confirm your billing account before opening secure billing management."}
                {" "}Please contact support to reconnect an existing subscription without paying twice.
              </p>
            ) : null}
          </>
        )}
        <p>Need help? Contact support: Email <a href={`mailto:${supportEmail}?subject=Subscription%20management%20request`}>{supportEmail}</a>. We can assist with payment recovery, cancellation, or reactivation.</p>
        <p><Link href="/">Back to home</Link></p>
      </section>
    </main>
  );
}
