import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { termsHtml } from "@/lib/termsContent";

export const metadata: Metadata = {
  title: "Privacy & Data Notice | AI Coach Directory",
  description: "How AI Coach Directory describes data handling, AI conversations, third-party providers, and privacy in its Terms.",
  alternates: { canonical: "/privacy" },
};

// Section 5 remains part of the Terms, not an independent or conflicting policy.
// Reuse the actual approved disclosure so this page never drifts from the Terms.
function privacyNoticeHtml() {
  const start = termsHtml.indexOf('<h2 id="privacy-data-notice">5. Privacy and Data Notice');
  const end = termsHtml.indexOf("<h2>6.", start);
  if (start < 0 || end <= start) {
    throw new Error("Privacy disclosure section not found in approved Terms");
  }
  return termsHtml.slice(start, end);
}

export default function PrivacyNoticePage() {
  return (
    <main className="legal-shell">
      <SiteHeader compact />
      <section className="legal-page-card">
        <div className="legal-brand-heading">
          <Image
            src="/images/ai-coach-directory-logo.jpg"
            alt="AI Coach Directory"
            width={104}
            height={104}
            className="legal-brand-logo"
          />
          <div>
            <p className="eyebrow">KCB INTEGRATIVE LLC · AI COACH DIRECTORY</p>
            <h1>Privacy &amp; Data Notice</h1>
          </div>
        </div>
        <p>
          This is Section 5 of our <Link href="/terms">Terms &amp; Conditions</Link>.
          It describes data handling for our services and is part of those Terms,
          not a separate legal agreement.
        </p>
        <div className="legal-copy" dangerouslySetInnerHTML={{ __html: privacyNoticeHtml() }} />
        <p>
          <Link href="/terms">Read the complete Terms &amp; Conditions</Link>
          {" · "}
          <Link href="/contact">Contact Us</Link>
        </p>
      </section>
      <footer className="site-footer">
        <div className="footer-brand">
          <Image src="/images/ai-coach-directory-logo.jpg" alt="AI Coach Directory" width={58} height={58} className="footer-logo" />
          <span>KCB Integrative LLC · AI Coach Directory</span>
        </div>
        <Link href="/">Home</Link>
        <Link href="/terms">Terms &amp; Conditions</Link>
        <p className="trademark-notice">© 2026 KCB Integrative LLC. All rights reserved.</p>
      </footer>
    </main>
  );
}
