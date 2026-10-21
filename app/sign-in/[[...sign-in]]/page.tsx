import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import SiteHeader from "@/components/SiteHeader";
import Link from "next/link";

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
      <p style={{ textAlign: "center", margin: "18px auto", maxWidth: 520 }}>
        Already paying but seeing "Couldn't find your account"?{" "}
        <Link href="/fitness/legacy-account">Activate your existing login</Link>, or{" "}
        <Link href="/manage-subscription">manage or cancel your subscription without signing in</Link>.
      </p>
      <SignIn />
    </main>
  );
}
