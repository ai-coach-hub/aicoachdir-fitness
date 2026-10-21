import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import SiteHeader from "@/components/SiteHeader";
import SupportContactForm from "@/components/SupportContactForm";
import {
  getFitnessMembership,
  memberHasFitnessAccess,
  rebindVerifiedMembershipLogin,
  refreshLinkedMembershipStatus,
  restoreVerifiedHistoricalBillingForMember,
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
  const contactConfigured = Boolean(process.env.RESEND_API_KEY && process.env.SUPPORT_CONTACT_FROM_EMAIL);
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
      await restoreVerifiedHistoricalBillingForMember(email, user.id);
      let member = await getFitnessMembership(email);
      if (member?.stripe_customer_id && member.stripe_subscription_id &&
          String(member.clerk_user_id || "") !== user.id) {
        member = (await rebindVerifiedMembershipLogin(email, user.id)) || member;
      }
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
  const statusMessage = renewalMessage === "canceled" && billingState === "canceling"
    ? "Your cancellation is confirmed. Automatic renewal is off, and your paid access continues through your current billing period."
    : renewalMessage === "already-canceling" && billingState === "canceling"
      ? "Your subscription is already scheduled to cancel at the end of your paid period."
      : renewalMessage === "resumed" && billingState === "active"
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
        <p>View your membership, update payment details, or cancel automatic renewal. You can cancel at any time and keep access through the end of your paid billing period.</p>
        {!user ? (
          <div>
            <p>Sign in to view and manage your subscription.</p>
            <div className="cta-row">
              <Link href="/fitness/login?destination=manage-subscription" className="primary-button">Member Login</Link>
              <Link href="/fitness/legacy-account?destination=manage-subscription" className="secondary-button">Activate Existing Login</Link>
            </div>
            <p className="microcopy">
              Already subscribed but not recognized? Activate your existing login with your original member email. No new purchase is required.
            </p>
          </div>
        ) : !emailVerified ? (
          <p>Please verify the email address on your member login before managing your subscription.</p>
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

            {billingState === "active" && linkedMember ? (
              <p className="microcopy">Cancel renewal without contacting support. Your current paid access continues until the end of the billing period.</p>
            ) : null}

            {billingState === "active" && linkedMember ? (
              <form method="post" action="/api/billing/cancel-renewal">
                <button className="secondary-button" type="submit">Cancel Automatic Renewal</button>
              </form>
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
                {" "}Contact support to verify your existing subscription, manage cancellation, or reconnect your account without paying twice. Do not sign up for another paid subscription.
              </p>
            ) : null}
          </>
        )}
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer" }}>Contact Support</summary>
          {contactConfigured ? (
            <SupportContactForm defaultTopic="Billing / Cancellation" />
          ) : (
            <p className="microcopy">
              For account or billing assistance, contact <a href={`mailto:${supportEmail}?subject=Cancellation%20request`} style={{ textDecoration: "underline" }}>{supportEmail}</a>.
              We'll verify account ownership before updating billing. Never share passwords or card numbers.
            </p>
          )}
        </details>
        <p><Link href="/">Back to home</Link></p>
      </section>
    </main>
  );
}
