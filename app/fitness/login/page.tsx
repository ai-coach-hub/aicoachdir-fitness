import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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

type LoginPageProps = {
  searchParams: Promise<{ destination?: string | string[] }>;
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

function normalizeDestination(value: string) {
  if (value === "fitness") return "fitness";
  if (value === "budget-coach") return "budget-coach";
  if (value === "budget-tracker") return "budget-tracker";
  return "";
}

function destinationPath(destination: string) {
  if (destination === "budget-coach") return "/budgeting/launch?destination=coach";
  if (destination === "budget-tracker") return "/budgeting/launch?destination=tracker";
  if (destination === "fitness") return "/fitness/chat";
  return "";
}

export default async function MemberLoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const rawDestination = Array.isArray(params.destination)
    ? params.destination[0]
    : params.destination;
  const destination = normalizeDestination(String(rawDestination || ""));
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

  const continuePath = destinationPath(destination);
  if (user && hasAccess && continuePath) {
    redirect(continuePath);
  }

  const loginReturnUrl = destination
    ? `/fitness/login?destination=${encodeURIComponent(destination)}`
    : "/fitness/login";

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
          Active $15 members currently have access to Fitness, My Workouts,
          Budgeting, and My Budget.
        </p>

        <FitnessMemberLoginClient
          hasAccess={hasAccess}
          accessCheckFailed={accessCheckFailed}
          loginReturnUrl={loginReturnUrl}
        />
      </section>
    </main>
  );
}
