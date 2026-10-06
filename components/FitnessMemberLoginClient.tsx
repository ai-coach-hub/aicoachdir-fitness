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
      </>
    );
  }

  return (
    <>
      <div className="verification-reminder" role="note">
        <strong>Already used Fitness Coach before?</strong>
        <span>
          If your email is not recognized here, your older Fitness Coach account
          may still be in Pickaxe and simply needs a one-time AI Coach Directory
          login activation. You will not be charged again.
        </span>
      </div>

      <div className="cta-row">
        <Link href="/fitness/legacy-account" className="primary-button">
          Activate my existing member login
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
        <SignIn
          routing="hash"
          forceRedirectUrl="/fitness/chat"
          signUpUrl="/fitness/legacy-account"
        />
      </div>

      <div className="cta-row">
        <Link href="/fitness/chat" className="secondary-button">
          Back to Fitness Coach
        </Link>
      </div>

      <p className="microcopy">
        Newer AI Coach Directory members can sign in normally above. Returning
        Pickaxe members only need to activate this login once using the same email
        they originally used for Fitness Coach.
      </p>
    </>
  );
}
