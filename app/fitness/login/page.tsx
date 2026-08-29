import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentFitnessMember } from "@/lib/currentFitnessMember";

export const dynamic = "force-dynamic";

export default async function FitnessMemberLoginPage() {
  const member = await getCurrentFitnessMember();

  if (!member.authenticated) {
    redirect("/sign-in");
  }

  if (member.hasFitnessAccess) {
    redirect("/member");
  }

  const verificationUnavailable = !member.membershipCheckOk;

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">MEMBER ACCESS</p>
        <h1>
          {verificationUnavailable
            ? "We could not verify your membership"
            : "No active Fitness Coach access found"}
        </h1>
        <p>
          {verificationUnavailable
            ? "Your sign-in worked, but the membership check is temporarily unavailable. Please try again shortly."
            : "You are signed in successfully, but this email is not currently linked to the AI Fitness Coach membership in Pickaxe."}
        </p>
        <div className="cta-row">
          <Link href="/fitness/signup" className="primary-button">
            Review Terms & Subscribe
          </Link>
          <Link href="/" className="secondary-button">
            Back to Fitness Coach
          </Link>
        </div>
      </section>
    </main>
  );
}
