import Link from "next/link";
import TermsDocument from "@/components/TermsDocument";

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <header className="nav compact">
        <Link href="/" className="brand">
          <span className="brand-mark">AI</span>
          <span className="brand-name">COACH DIRECTORY</span>
        </Link>
        <Link href="/fitness/signup" className="nav-cta">Review & Subscribe</Link>
      </header>

      <section className="legal-page-card">
        <p className="eyebrow">KCB INTEGRATIVE LLC</p>
        <h1>Terms & Conditions</h1>
        <TermsDocument />
      </section>

      <footer>
        <span>KCB Integrative LLC</span>
        <Link href="/fitness/signup">Fitness Coach Subscription</Link>
      </footer>
    </main>
  );
}
