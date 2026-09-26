import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
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
  return (
    <main className="signup-shell">
      <SiteHeader compact />

      <section className="login-config-card" aria-labelledby="fitness-member-login-heading">
        <p className="eyebrow">MEMBER LOGIN</p>
        <h1 id="fitness-member-login-heading">AI Fitness Coach 2.0 Member Login</h1>
        <p>
          Sign in here with your AI Coach Directory member account. After sign-in, you will
          return directly to your AI Fitness Coach.
        </p>

        <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
          <SignIn
            routing="hash"
            forceRedirectUrl="/fitness/chat"
            signUpUrl="/fitness/signup"
          />
        </div>

        <div className="cta-row">
          <Link href="/fitness/chat" className="secondary-button">
            Back to Fitness Coach
          </Link>
        </div>

        <p className="microcopy">
          Your AI Coach Directory sign-in connects you directly to your Fitness Coach and saved workouts.
        </p>
      </section>
    </main>
  );
}
