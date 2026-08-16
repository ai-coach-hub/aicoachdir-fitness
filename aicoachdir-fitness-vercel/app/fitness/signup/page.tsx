import Image from "next/image";
import Link from "next/link";
import TermsDocument from "@/components/TermsDocument";
import TermsGate from "@/components/TermsGate";
import SiteHeader from "@/components/SiteHeader";

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

      <TermsGate>
        <TermsDocument />
      </TermsGate>

      <footer className="site-footer signup-footer">
        <div className="footer-brand">
          <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={58} height={58} className="footer-logo" />
          <span>KCB Integrative LLC · AI Coach Directory<span className="tm-mark">™</span></span>
        </div>
        <Link href="/terms">Open full Terms page</Link>

        <p className="trademark-notice">
          © 2026 KCB Integrative LLC. AI Coach Directory<span className="tm-mark">™</span> and the AI Coach Directory logo are trademarks/service marks claimed by KCB Integrative LLC. All rights reserved. Third-party marks belong to their respective owners.
        </p>
      </footer>
    </main>
  );
}
