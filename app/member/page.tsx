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

  const currentCoachUrl =
    process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "";

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
          <Link href="/my-workouts" className="primary-button">
            My Workouts
          </Link>
          {currentCoachUrl ? (
            <a href={currentCoachUrl} className="secondary-button">
              Open Fitness Coach
            </a>
          ) : null}
        </div>

        <p className="microcopy center">
          Preview note: My Workouts now uses this single Clerk member session. The
          Fitness Coach button still opens the existing Pickaxe portal while the
          direct API/MCP chat integration is tested separately.
        </p>
      </section>
    </main>
  );
}
