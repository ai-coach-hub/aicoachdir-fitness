import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

// The 404 was Next's unbranded black-and-white default: a commercial site dropping a visitor
// onto a page that looks like a broken server. Reuses SiteHeader so a mistyped URL still
// offers a way back into the funnel rather than a dead end.
export const metadata = { title: "Page not found | AI Coach Directory" };

export default function NotFound() {
  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">404</p>
        <h1>We couldn&apos;t find that page.</h1>
        <p>
          The link may be out of date, or the address may have a typo. Everything below is still
          where you left it.
        </p>
        <div className="cta-row">
          <Link href="/" className="primary-button">Back to AI Fitness Coach</Link>
          <Link href="/fitness/login" className="secondary-button">Member Login</Link>
        </div>
      </section>
    </main>
  );
}
