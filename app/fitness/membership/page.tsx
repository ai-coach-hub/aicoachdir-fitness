import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manage your membership | AI Coach Directory",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = "Ai.coach.hub.domain@gmail.com";

type MembershipPageProps = {
  searchParams: Promise<{ portal?: string | string[] }>;
};

export default async function FitnessMembershipPage({ searchParams }: MembershipPageProps) {
  const user = await currentUser();
  if (!user) redirect("/fitness/login");
  const params = await searchParams;
  const portal = Array.isArray(params.portal) ? params.portal[0] : params.portal;

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">MEMBERSHIP</p>
        <h1>Manage your membership</h1>
        <p>
          Update your payment method, see your invoices, or cancel. When you cancel, your membership stays
          active until the end of the period you have paid for, and it does not renew.
        </p>
        {portal === "unavailable" ? (
          <p role="status">
            We could not open billing management just now. Email us and we will cancel or update your
            membership for you.
          </p>
        ) : null}
        <form method="post" action="/api/billing/portal" className="cta-row">
          <button type="submit" className="primary-button">Manage or cancel membership</button>
          <Link href="/fitness/chat" className="secondary-button">Back to your coach</Link>
        </form>
        <p className="microcopy">
          Prefer email? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email on your
          membership, and say you would like to cancel.
        </p>
      </section>
    </main>
  );
}
