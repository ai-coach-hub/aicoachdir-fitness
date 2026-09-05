import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import TermsDocument from "@/components/TermsDocument";
import TermsGate from "@/components/TermsGate";
import SiteHeader from "@/components/SiteHeader";

// Canonical resolves against metadataBase in app/layout.tsx.
export const metadata: Metadata = {
  alternates: { canonical: "/fitness/signup" },
};

export default function FitnessSignupPage() {
  return (
    <main className="signup-shell">
      <SiteHeader compact />

      <section className="signup-brand-intro">
        <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={92} height={92} className="signup-brand-logo" />
        <div>
          <p className="eyebrow">AI COACH DIRECTORY<span className="tm-mark">™</span></p>
          <p className="signup-brand-copy">AI Fitness Coach 2.0 subscription review</p>
        </div>
        <Link href="/" className="back-link">← Back to Fitness Coach</Link>
      </section>

      <section className="returning-member-callout" aria-label="Returning member login">
        <div>
          <p className="eyebrow compact-eyebrow">ALREADY SUBSCRIBED?</p>
          <h2>Returning members can go straight to sign in.</h2>
          <p>You do not need to repeat the new-subscription Terms flow just to access your existing Fitness Coach account.</p>
        </div>
        <Link href="/fitness/login" className="secondary-button returning-login-button">Member Login</Link>
      </section>

      <TermsGate>
        <TermsDocument />
      </TermsGate>

      <footer className="site-footer signup-footer">
        <div className="footer-brand">
          <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={58} height={58} className="footer-logo" />
          <span>KCB Integrative LLC · AI Coach Directory<span className="tm-mark">™</span></span>
        </div>
        <div className="footer-links">
          <Link href="/fitness/login">Member Login</Link>
          <Link href="/terms">Open full Terms page</Link>
        </div>

        <p className="trademark-notice">
          © 2026 KCB Integrative LLC. AI Coach Directory<span className="tm-mark">™</span> and the AI Coach Directory logo are trademarks/service marks claimed by KCB Integrative LLC. All rights reserved. Third-party marks belong to their respective owners.
        </p>
      </footer>
    </main>
  );
}
