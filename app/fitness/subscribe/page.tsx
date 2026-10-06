import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import FitnessCheckoutCard from "@/components/FitnessCheckoutCard";
import SiteHeader from "@/components/SiteHeader";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import { ensureTermsAcceptanceSchema } from "@/lib/termsAcceptanceDb";

export const dynamic = "force-dynamic";

const TERMS_COOKIE = "fitness_terms_acceptance";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

function SetupProblem({ message }: { message: string }) {
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">SUBSCRIPTION SETUP</p>
        <h1>We need to reconnect one step.</h1>
        <p>{message}</p>
        <div className="cta-row">
          <Link href="/fitness/signup" className="primary-button">
            Restart Subscription Setup
          </Link>
          <Link href="/fitness/login" className="secondary-button">
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
    alreadyActive = await memberHasFitnessAccess(email, user.id, {
      fallbackToPickaxeList: false,
    });
  } catch {
    return (
      <SetupProblem message="We could not verify your current AI Coach Directory membership. No charge was attempted." />
    );
  }

  if (alreadyActive) {
    redirect(activeDestination);
  }

  const cookieStore = await cookies();
  const acceptanceId = cookieStore.get(TERMS_COOKIE)?.value || "";
  if (!UUID_PATTERN.test(acceptanceId)) redirect(signupUrl);

  try {
    const sql = await ensureTermsAcceptanceSchema();
    const rows = await sql`
      SELECT email
      FROM terms_acceptances
      WHERE id = ${acceptanceId}::uuid
        AND accepted_at >= NOW() - INTERVAL '1 hour'
      LIMIT 1
    `;

    const acceptedEmail = String(rows[0]?.email || "").trim().toLowerCase();
    if (!acceptedEmail || acceptedEmail !== email) {
      return (
        <SetupProblem message="Your signed-in email does not match the email used for Terms acceptance. Please restart with the same email." />
      );
    }
  } catch {
    return (
      <SetupProblem message="We could not verify your Terms acceptance. No charge was attempted." />
    );
  }

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <FitnessCheckoutCard destination={destination} />
    </main>
  );
}
