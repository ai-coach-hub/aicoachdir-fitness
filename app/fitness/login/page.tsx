import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "AI Fitness Coach Member Login | AI Coach Directory",
  description:
    "Access the AI Fitness Coach 2.0 member portal for personalized fitness coaching, workout planning, accountability, and progress support.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function FitnessMemberLoginPage() {
  const portalUrl = process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "";

  return (
    <main className="signup-shell">
      <SiteHeader compact />

      <section className="login-config-card" aria-labelledby="fitness-member-login-heading">
        <p className="eyebrow">MEMBER LOGIN</p>
        <h1 id="fitness-member-login-heading">AI Fitness Coach 2.0 Member Login</h1>
        <p>
          Returning members can continue to the secure AI Fitness Coach portal to access
          coaching, workout planning, saved workouts, and account features.
        </p>

        {portalUrl ? (
          <>
            <div className="cta-row">
              <a href={portalUrl} className="primary-button">
                Continue to Member Login
              </a>
              <Link href="/" className="secondary-button">
                Back to Fitness Coach
              </Link>
            </div>
            <p className="microcopy">
              You will continue to the existing secure member portal. Your subscription and
              saved portal experience are unchanged.
            </p>
          </>
        ) : (
          <>
            <p className="config-warning">
              The Pickaxe member portal URL has not been configured for this deployment yet.
              Add NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL in Vercel and redeploy.
            </p>
            <div className="cta-row">
              <Link href="/" className="secondary-button">
                Back to Fitness Coach
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
