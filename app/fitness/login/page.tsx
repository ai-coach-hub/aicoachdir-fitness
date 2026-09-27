import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import FitnessMemberLoginClient from "@/components/FitnessMemberLoginClient";

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

      <section
        className="login-config-card"
        aria-labelledby="fitness-member-login-heading"
      >
        <p className="eyebrow">MEMBER LOGIN</p>
        <h1 id="fitness-member-login-heading">
          AI Fitness Coach 2.0 Member Login
        </h1>
        <p>
          Sign in here with your AI Coach Directory member account. After
          sign-in, you will return directly to your AI Fitness Coach.
        </p>

        <FitnessMemberLoginClient />
      </section>
    </main>
  );
}
