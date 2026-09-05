import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Create Account | AI Coach Directory",
  description: "Create your AI Coach Directory account to begin your coaching experience.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignUpPage() {
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="terms-heading">
        <p className="eyebrow">CREATE ACCOUNT</p>
        <h1>Create your AI Coach Directory account</h1>
        <p>Set up your account to begin your coaching experience.</p>
      </section>
      <SignUp />
    </main>
  );
}
