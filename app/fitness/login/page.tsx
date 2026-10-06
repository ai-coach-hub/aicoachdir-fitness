import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import SiteHeader from "@/components/SiteHeader";
import FitnessMemberLoginClient from "@/components/FitnessMemberLoginClient";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Member Login | AI Coach Directory",
  description:
    "Sign in to your AI Coach Directory membership and access the coaches included with your plan.",
  robots: {
    index: false,
    follow: true,
  },
};

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

export default async function MemberLoginPage() {
  const user = await currentUser();
  const email = primaryEmail(user);

  let hasAccess = false;
  let accessCheckFailed = false;

  if (user && email) {
    try {
      hasAccess = await memberHasFitnessAccess(email, user.id);
    } catch {
      accessCheckFailed = true;
    }
  }

  return (
    <main className="signup-shell">
      <SiteHeader compact />

      <section
        className="login-config-card"
        aria-labelledby="member-login-heading"
      >
        <p className="eyebrow">MEMBER LOGIN</p>
        <h1 id="member-login-heading">AI Coach Directory Member Login</h1>
        <p>
          Sign in once to access the coaches included with your membership.
          Active $15 members currently have access to both Fitness and Budgeting.
        </p>

        <FitnessMemberLoginClient
          hasAccess={hasAccess}
          accessCheckFailed={accessCheckFailed}
        />
      </section>
    </main>
  );
}
