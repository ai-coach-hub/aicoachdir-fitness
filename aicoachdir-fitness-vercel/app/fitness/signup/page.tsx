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
          <p className="eyebrow">AI COACH DIRECTORY</p>
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
          <span>KCB Integrative LLC · AI Coach Directory</span>
        </div>
        <Link href="/terms">Open full Terms page</Link>
      </footer>
    </main>
  );
}
