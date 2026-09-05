import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Sign In | AI Coach Directory",
  description: "Sign in to your AI Coach Directory account to continue to your coaching experience.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignInPage() {
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="terms-heading">
        <p className="eyebrow">MEMBER ACCESS</p>
        <h1>Sign in to AI Coach Directory</h1>
        <p>Access your account and continue to your coaching experience.</p>
      </section>
      <SignIn />
    </main>
  );
}
