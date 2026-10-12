import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import SiteHeader from "@/components/SiteHeader";
import { getFitnessMembership, memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import { linkVerifiedLegacyStripeMembership } from "@/lib/legacyStripeMembership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage Subscription | AI Coach Directory",
  robots: { index: false, follow: false },
};

const supportEmail = "Ai.coach.hub.domain@gmail.com";

export default async function ManageSubscriptionPage() {
  const user = await currentUser();
  const primaryAddress = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
    || user?.emailAddresses[0];
  const email = primaryAddress?.emailAddress || "";
  // A billing link is created only from a Clerk-verified email.
  const emailVerified = primaryAddress?.verification?.status === "verified";
  let hasStripeBilling = false;
  let lookupFailed = false;
  if (email) {
    try {
      let member = await getFitnessMembership(email);
      if (emailVerified && user && (!member || (member.access_active === true && String(member.clerk_user_id || "") !== user.id))) {
        await memberHasFitnessAccess(email, user.id);
        member = await getFitnessMembership(email);
      }
      if (emailVerified && user && member?.access_active === true && !member.stripe_customer_id) {
        member = (await linkVerifiedLegacyStripeMembership(email, user.id)) || member;
      }
      hasStripeBilling = !!member?.stripe_customer_id;
    } catch {
      lookupFailed = true;
    }
  }
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card" aria-labelledby="subscription-heading">
        <p className="eyebrow">ACCOUNT</p>
        <h1 id="subscription-heading">Manage Subscription</h1>
        <p>View your subscription or cancel automatic renewal. If you cancel, access continues until the end of your current paid billing period.</p>
        {!user ? (
          <p><Link href="/fitness/login">Sign in</Link> with your membership account to manage billing.</p>
        ) : hasStripeBilling ? (
          <form method="post" action="/api/billing/customer-portal">
            <button className="secondary-button" type="submit">Open secure billing management</button>
          </form>
        ) : (
          <p>{lookupFailed ? "We couldn't load your billing details right now." : "We need to confirm your billing account before opening secure billing management."} Please contact support to manage or cancel your subscription. You do not need to purchase another membership.</p>
        )}
        <p>Need help with your subscription? Contact support: Email <a href={`mailto:${supportEmail}?subject=Subscription%20cancellation%20request`}>{supportEmail}</a>. We will help you cancel without requiring you to search the Terms.</p>
        <p><Link href="/">Back to home</Link></p>
      </section>
    </main>
  );
}
