import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";

export default function FitnessMemberLoginPage() {
  const portalUrl = process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "";

  if (portalUrl) {
    redirect(portalUrl);
  }

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card">
        <p className="eyebrow">MEMBER LOGIN</p>
        <h1>Fitness Coach member access</h1>
        <p>
          The Pickaxe member portal URL has not been configured for this deployment yet.
          Add the environment variable below in Vercel and redeploy.
        </p>
        <code>NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL</code>
        <div className="cta-row">
          <Link href="/" className="secondary-button">Back to Fitness Coach</Link>
        </div>
      </section>
    </main>
  );
}
