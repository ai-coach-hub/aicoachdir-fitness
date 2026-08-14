import Link from "next/link";
import TermsGate from "@/components/TermsGate";

export default function FitnessSignupPage() {
  return (
    <main className="signup-shell">
      <header className="nav compact">
        <Link href="/" className="brand">AI <span>COACHDIR</span></Link>
        <Link href="/" className="back-link">← Back to Fitness Coach</Link>
      </header>
      <TermsGate />
      <footer className="signup-footer">KCB Integrative, LLC</footer>
    </main>
  );
}
