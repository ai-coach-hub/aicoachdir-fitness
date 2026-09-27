"use client";

import Link from "next/link";
import { SignIn, useClerk, useUser } from "@clerk/nextjs";

export default function FitnessMemberLoginClient() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  if (!isLoaded) {
    return <p className="status-note">Loading member login…</p>;
  }

  if (isSignedIn) {
    return (
      <>
        <div className="verification-reminder" role="status">
          <strong>You are already signed in</strong>
          <span>{email || "Current AI Coach Directory account"}</span>
        </div>

        <div className="cta-row">
          <Link href="/fitness/chat" className="primary-button">
            Continue to Fitness Coach
          </Link>
          <button
            type="button"
            className="secondary-button"
            onClick={() => signOut({ redirectUrl: "/fitness/login" })}
          >
            Use a different account
          </button>
        </div>

        <p className="microcopy">
          If you are trying to use a different existing Pickaxe member email,
          choose “Use a different account” first.
        </p>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
        <SignIn
          routing="hash"
          forceRedirectUrl="/fitness/chat"
          signUpUrl="/fitness/legacy-account"
        />
      </div>

      <div className="cta-row">
        <Link href="/fitness/legacy-account" className="secondary-button">
          First time using this member login?
        </Link>
        <Link href="/fitness/chat" className="secondary-button">
          Back to Fitness Coach
        </Link>
      </div>

      <p className="microcopy">
        Your AI Coach Directory sign-in connects you directly to your Fitness
        Coach and saved workouts.
      </p>
    </>
  );
}
