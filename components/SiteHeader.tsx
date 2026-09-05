import Image from "next/image";
import Link from "next/link";

export default function SiteHeader({ compact = false }: { compact?: boolean }) {
  const memberLoginUrl = process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "/fitness/login";

  return (
    <header className={compact ? "nav compact" : "nav"}>
      <Link href="/" className="brand brand-with-logo" aria-label="AI Coach Directory home">
        <Image
          src="/images/ai-coach-directory-logo.jpg"
          alt="AI Coach Directory"
          width={92}
          height={92}
          priority
          className="brand-logo"
        />
        <span className="brand-text-wrap">
          <span className="brand-title">AI Coach Directory<span className="tm-mark">™</span></span>
          <span className="brand-company">KCB Integrative LLC</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="Primary navigation">
        <a href="/#how-it-works" className="nav-link-text">How it works</a>
        <Link href="/terms" className="nav-link-text">Terms</Link>
        <a href={memberLoginUrl} className="nav-member-login">Member Login</a>
        <Link href="/fitness/signup" className="nav-cta">Start Fitness Coach</Link>
      </nav>
    </header>
  );
}
