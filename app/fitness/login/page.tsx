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
        <h1 id="fitness-member-login-heading">AI Fitness Coach 2.0 Member Access</h1>
        <p>
          Sign in below to continue to your AI Fitness Coach, workout planning, and saved
          member experience.
        </p>

        {portalUrl ? (
          <div
            style={{
              marginTop: "28px",
              overflow: "hidden",
              borderRadius: "18px",
              border: "1px solid rgba(116, 182, 215, 0.22)",
              background: "#ffffff",
              boxShadow: "0 22px 70px rgba(0, 0, 0, 0.28)",
            }}
          >
            <iframe
              src={portalUrl}
              title="AI Fitness Coach 2.0 member portal"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{
                display: "block",
                width: "100%",
                minHeight: "820px",
                border: 0,
                background: "#ffffff",
              }}
            />
          </div>
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
