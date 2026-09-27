import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { TERMS_VERSION } from "@/lib/termsAcceptance";
import { ensureTermsAcceptanceSchema } from "@/lib/termsAcceptanceDb";

export const dynamic = "force-dynamic";

const FITNESS_TERMS_COOKIE = "fitness_terms_acceptance";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function primaryEmailForUser(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primaryId = user.primaryEmailAddressId;
  const primary = user.emailAddresses.find((item) => item.id === primaryId);
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "").trim().toLowerCase();
}

function HandoffError({ message }: { message: string }) {
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

export default async function FitnessSubscribePage() {
  const user = await currentUser();
  if (!user) {
    redirect("/fitness/login?subscribe=1");
  }

  const memberEmail = primaryEmailForUser(user);
  const cookieStore = await cookies();
  const acceptanceId = cookieStore.get(FITNESS_TERMS_COOKIE)?.value || "";

  if (!memberEmail || !UUID_PATTERN.test(acceptanceId)) {
    redirect("/fitness/signup");
  }

  let acceptedEmail = "";

  try {
    const sql = await ensureTermsAcceptanceSchema();
    const rows = await sql`
      SELECT email
      FROM terms_acceptances
      WHERE id = ${acceptanceId}::uuid
        AND terms_version = ${TERMS_VERSION}
        AND accepted_at >= NOW() - INTERVAL '1 hour'
      LIMIT 1
    `;
    acceptedEmail = String(rows[0]?.email || "").trim().toLowerCase();
  } catch {
    console.error("Terms handoff verification failed.");
    return (
      <HandoffError message="We could not verify your Terms acceptance right now. You have not been charged." />
    );
  }

  if (!acceptedEmail) {
    return (
      <HandoffError message="Your Terms acceptance session expired. Please review and accept the Terms again before subscribing." />
    );
  }

  if (acceptedEmail !== memberEmail) {
    return (
      <HandoffError message="The email on your AI Coach Directory account does not match the email used for Terms acceptance. Please restart with the same email so your membership and saved workouts stay connected." />
    );
  }

  const signupUrl = (process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "").trim();
  if (!signupUrl) {
    return (
      <HandoffError message="The secure subscription destination is not configured. You have not been charged." />
    );
  }

  redirect(signupUrl);
}
