import Image from "next/image";
import Link from "next/link";

export default function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={compact ? "nav compact" : "nav"}>
      <Link href="/" className="brand brand-with-logo" aria-label="AI Coach Directory home">
        <Image
          src="/images/ai-coach-directory-logo.jpg"
          alt="AI Coach Directory"
          width={92}
          height={92}
          loading="eager"
          sizes="76px"
          className="brand-logo"
        />
        <span className="brand-text-wrap">
          <span className="brand-title">AI Coach Directory</span>
          <span className="brand-company">KCB Integrative LLC</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="Primary navigation">
        <a href="/#how-it-works" className="nav-link-text">How it works</a>
        <Link href="/terms" className="nav-link-text">Terms</Link>
        <Link href="/fitness/login?destination=fitness" className="nav-coach-link">Fitness Coach</Link>
        <Link href="/fitness/login?destination=budget-coach" className="nav-coach-link">Budgeting Coach</Link>
      </nav>
    </header>
  );
}
