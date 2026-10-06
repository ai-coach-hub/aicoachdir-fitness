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
        <p className="eyebrow">RETURNING FITNESS MEMBER</p>
        <h1 id="legacy-member-heading">
          Activate your existing member login
        </h1>
        <p>
          Use the same email address you originally used for Fitness Coach.
          This creates the newer AI Coach Directory sign-in and reconnects it
          to your existing Fitness Coach membership.
        </p>

        <div className="verification-reminder" role="note">
          <strong>This is not a new subscription</strong>
          <span>
            You will not be sent through Stripe checkout just for activating
            this login. Your existing Pickaxe membership, saved workouts, and
            Fitness Coach identity remain tied to the same email.
          </span>
        </div>

        {!isLoaded ? (
          <p className="status-note">Loading account status…</p>
        ) : isSignedIn ? (
          <>
            <div className="verification-reminder" role="status">
              <strong>You are currently signed in as</strong>
              <span>{email || "another AI Coach Directory account"}</span>
            </div>

            <div className="cta-row">
              <Link href="/fitness/chat" className="primary-button">
                Continue to Fitness Coach
              </Link>
              <button
                type="button"
                className="secondary-button"
                onClick={() => signOut({ redirectUrl: "/fitness/legacy-account" })}
              >
                Use a different member email
              </button>
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
              <strong>Use your original Fitness Coach email</strong>
              <span>
                Clerk may ask you to verify that email. After verification, the
                Fitness Coach checks Pickaxe for the matching member and connects
                the new login automatically.
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
