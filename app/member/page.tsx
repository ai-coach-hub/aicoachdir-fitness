import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentFitnessMember } from "@/lib/currentFitnessMember";

export const dynamic = "force-dynamic";

export default async function MemberPage() {
  const member = await getCurrentFitnessMember();

  if (!member.authenticated) {
    redirect("/sign-in");
  }

  if (!member.membershipCheckOk || !member.hasFitnessAccess) {
    redirect("/fitness/login");
  }

  return (
    <main className="signup-shell">
      <SiteHeader compact />

      <section className="login-config-card">
        <p className="eyebrow">AI FITNESS COACH MEMBER</p>
        <h1>Welcome back.</h1>
        <p>
          Your sign-in and Fitness Coach membership have both been verified.
        </p>

        <div className="cta-row">
          <Link href="/fitness/coach" className="primary-button">
            Open Fitness Coach
          </Link>
          <Link href="/my-workouts" className="secondary-button">
            My Workouts
          </Link>
        </div>

        <p className="microcopy center">
          Preview: Fitness Coach and My Workouts now use the same verified member
          session. Production remains unchanged until final testing is complete.
        </p>
      </section>
    </main>
  );
}
