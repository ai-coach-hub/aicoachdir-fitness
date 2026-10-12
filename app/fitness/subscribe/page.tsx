import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import FitnessCheckoutCard from "@/components/FitnessCheckoutCard";
import SiteHeader from "@/components/SiteHeader";
import { getFitnessMembership, memberHasFitnessAccess, refreshLinkedMembershipStatus, restoreVerifiedHistoricalBillingForMember } from "@/lib/fitnessMembershipDb";
import { getVerifiedSubscription } from "@/lib/stripeMembershipState";
import { currentMembershipTermsId } from "@/lib/currentMembershipTerms";

export const dynamic = "force-dynamic";

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

function SetupProblem({ message, destination = "fitness" }: { message: string; destination?: "fitness" | "budget-coach" }) {
  const query = `?destination=${destination}`;
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">SUBSCRIPTION SETUP</p>
        <h1>We need to reconnect one step.</h1>
        <p>{message}</p>
        <div className="cta-row">
          <Link href={`/fitness/signup${query}`} className="primary-button">
            Restart Subscription Setup
          </Link>
          <Link href={`/fitness/login${query}`} className="secondary-button">
            Member Login
          </Link>
        </div>
      </section>
    </main>
  );
}

type SubscribePageProps = {
  searchParams: Promise<{ destination?: string | string[] }>;
};

export default async function FitnessSubscribePage({ searchParams }: SubscribePageProps) {
  const params = await searchParams;
  const rawDestination = Array.isArray(params.destination)
    ? params.destination[0]
    : params.destination;
  const destination = rawDestination === "budget-coach" ? "budget-coach" : "fitness";
  const loginUrl = `/fitness/login?destination=${destination}`;
  const signupUrl = `/fitness/signup?destination=${destination}`;
  const activeDestination = destination === "budget-coach"
    ? "/budgeting/launch?destination=coach"
    : "/fitness/chat";
  const user = await currentUser();
  if (!user) redirect(loginUrl);

  const email = primaryEmail(user);
  if (!email) redirect(loginUrl);

  let alreadyActive = false;
  try {
    const verifiedPrimary = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
    if (verifiedPrimary?.verification?.status !== "verified") {
      return (
        <SetupProblem destination={destination} message="Please verify your account email before managing a subscription." />
      );
    }
    await restoreVerifiedHistoricalBillingForMember(email, user.id);
    alreadyActive = await memberHasFitnessAccess(email, user.id, {
      fallbackToPickaxeList: false,
    });
  } catch {
    return (
      <SetupProblem destination={destination} message="We could not verify your current AI Coach Directory membership. No charge was attempted." />
    );
  }

  if (alreadyActive) {
    redirect(activeDestination);
  }

  // Recoverable subscriptions return to their existing Stripe billing.
  // A payment fixed moments ago is refreshed immediately, without checkout.
  let recoveredPaidAccess = false;
  let recoveryNeedsPayment = false;
  try {
    const member = await getFitnessMembership(email);
    if (member?.stripe_customer_id && member?.stripe_subscription_id) {
      const live = await getVerifiedSubscription({
        customerId: String(member.stripe_customer_id),
        subscriptionId: String(member.stripe_subscription_id),
        memberEmail: email,
      });
      if (live?.state === "recoverable") recoveryNeedsPayment = true;
      if (live?.state === "active" || live?.state === "canceling") {
        const synced = await refreshLinkedMembershipStatus(email, { force: true });
        recoveredPaidAccess = synced?.access_active === true;
      }
    }
  } catch {
    return (
      <SetupProblem destination={destination} message="We could not verify your existing billing details. No charge was attempted." />
    );
  }
  if (recoveredPaidAccess) redirect(activeDestination);
  if (recoveryNeedsPayment) redirect("/manage-subscription");

  let acceptanceId = "";
  try {
    acceptanceId = await currentMembershipTermsId(email);
  } catch {
    return (
      <SetupProblem destination={destination} message="We could not verify your current Terms acceptance. No charge was attempted." />
    );
  }
  if (!acceptanceId) redirect(signupUrl);

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <FitnessCheckoutCard destination={destination} />
    </main>
  );
}
