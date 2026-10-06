import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import TermsDocument from "@/components/TermsDocument";
import SiteHeader from "@/components/SiteHeader";

// Canonical resolves against metadataBase in app/layout.tsx.
export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <SiteHeader compact />

      <section className="legal-page-card">
        <div className="legal-brand-heading">
          <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={104} height={104} className="legal-brand-logo" />
          <div>
            <p className="eyebrow">KCB INTEGRATIVE LLC · AI COACH DIRECTORY</p>
            <h1>Terms & Conditions</h1>
          </div>
        </div>
        <TermsDocument />
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={58} height={58} className="footer-logo" />
          <span>KCB Integrative LLC · AI Coach Directory</span>
        </div>
        <Link href="/fitness/signup">Fitness Coach Subscription</Link>

        <p className="trademark-notice">
          © 2026 KCB Integrative LLC. All rights reserved. Third-party marks belong to their respective owners.
        </p>
      </footer>
    </main>
  );
}
