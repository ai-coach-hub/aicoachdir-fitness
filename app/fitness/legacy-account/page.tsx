"use client";

import Link from "next/link";
import { SignUp, useClerk, useUser } from "@clerk/nextjs";
import SiteHeader from "@/components/SiteHeader";

export default function LegacyMemberAccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section
        className="login-config-card"
        aria-labelledby="legacy-member-heading"
      >
        <p className="eyebrow">EXISTING FITNESS MEMBER</p>
        <h1 id="legacy-member-heading">
          Activate your AI Coach Directory login
        </h1>
        <p>
          If you already had Fitness Coach access through Pickaxe, create your
          AI Coach Directory login with that same email. You will not be sent
          through checkout just for creating this login.
        </p>

        {!isLoaded ? (
          <p className="status-note">Loading account status…</p>
        ) : isSignedIn ? (
          <>
            <div className="verification-reminder" role="status">
              <strong>You are currently signed in as</strong>
              <span>{email || "another AI Coach Directory account"}</span>
            </div>

            <div className="cta-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => signOut({ redirectUrl: "/fitness/legacy-account" })}
              >
                Sign out and activate a different member email
              </button>
              <Link href="/fitness/chat" className="secondary-button">
                Continue with this account
              </Link>
            </div>
          </>
        ) : (
          <>
            <div
              style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}
            >
              <SignUp
                routing="hash"
                forceRedirectUrl="/fitness/chat"
                signInUrl="/fitness/login"
              />
            </div>

            <div className="verification-reminder" role="note">
              <strong>Use your existing member email</strong>
              <span>
                Clerk may ask you to verify that email. This replaces the old
                Pickaxe login; it does not create a second paid subscription.
              </span>
            </div>
          </>
        )}

        <div className="cta-row">
          <Link href="/fitness/login" className="secondary-button">
            Back to Member Login
          </Link>
        </div>
      </section>
    </main>
  );
}
