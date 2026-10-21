import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SupportContactForm from "@/components/SupportContactForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact Us | AI Coach Directory" };

export default function ContactPage() {
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.SUPPORT_CONTACT_FROM_EMAIL);
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">SUPPORT</p>
        <h1>Contact Us</h1>
        <p>Have a question, need help with your account, or want to report an issue? Send us a message below.</p>
        {configured ? <SupportContactForm /> : <p>Support form is temporarily unavailable. Please try again later.</p>}
        <p className="microcopy">Need to cancel or manage your membership? <Link href="/manage-subscription">Manage Subscription</Link> lets you cancel renewal directly without waiting for a support reply.</p>
        <p><Link href="/">Back to home</Link></p>
      </section>
    </main>
  );
}
