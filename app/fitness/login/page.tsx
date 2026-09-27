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

type LoginPageProps = {
  searchParams: Promise<{
    subscribe?: string | string[];
  }>;
};

export default async function FitnessMemberLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const continueSubscription =
    params.subscribe === "1" ||
    (Array.isArray(params.subscribe) && params.subscribe.includes("1"));
  const destination = continueSubscription ? "/fitness/subscribe" : "/fitness/chat";

  return (
    <main className="signup-shell">
      <SiteHeader compact />

      <section className="login-config-card" aria-labelledby="fitness-member-login-heading">
        <p className="eyebrow">MEMBER LOGIN</p>
        <h1 id="fitness-member-login-heading">AI Fitness Coach 2.0 Member Login</h1>
        <p>
          {continueSubscription
            ? "Sign in with your AI Coach Directory account to continue the secure Fitness Coach subscription setup."
            : "Sign in here with your AI Coach Directory member account. After sign-in, you will return directly to your AI Fitness Coach."}
        </p>

        <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
          <SignIn
            routing="hash"
            forceRedirectUrl={destination}
            signUpUrl="/fitness/signup"
          />
        </div>

        <div className="cta-row">
          <Link href={continueSubscription ? "/fitness/signup" : "/fitness/chat"} className="secondary-button">
            {continueSubscription ? "Back to Subscription Setup" : "Back to Fitness Coach"}
          </Link>
        </div>

        <p className="microcopy">
          {continueSubscription
            ? "Use the same email you used when accepting the Terms so your subscription, coach identity, and saved workouts stay connected."
            : "Your AI Coach Directory sign-in connects you directly to your Fitness Coach and saved workouts."}
        </p>
      </section>
    </main>
  );
}
