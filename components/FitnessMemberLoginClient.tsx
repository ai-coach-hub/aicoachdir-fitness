"use client";

import Link from "next/link";
import { SignIn, useClerk, useUser } from "@clerk/nextjs";

type Props = {
  hasAccess: boolean;
  accessCheckFailed: boolean;
  loginReturnUrl: string;
};

export default function FitnessMemberLoginClient({
  hasAccess,
  accessCheckFailed,
  loginReturnUrl,
}: Props) {
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
    if (accessCheckFailed) {
      return (
        <>
          <div className="verification-reminder" role="status">
            <strong>Membership verification is temporarily unavailable</strong>
            <span>
              Your account is signed in, but we could not confirm membership
              access right now.
            </span>
          </div>

          <div className="cta-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => signOut({ redirectUrl: loginReturnUrl })}
            >
              Use a different account
            </button>
          </div>
        </>
      );
    }

    if (hasAccess) {
      return (
        <>
          <div className="verification-reminder" role="status">
            <strong>You are signed in</strong>
            <span>{email || "Current AI Coach Directory account"}</span>
          </div>

          <div className="cta-row">
            <Link href="/fitness/chat" className="primary-button">
              Open Fitness Coach
            </Link>
            <Link href="/budget/coach" className="primary-button">
              Open Budgeting Coach
            </Link>
            <button
              type="button"
              className="secondary-button"
              onClick={() => signOut({ redirectUrl: loginReturnUrl })}
            >
              Use a different account
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="verification-reminder" role="status">
          <strong>No active membership was found for this account</strong>
          <span>
            Use the same email tied to your existing membership, or review the
            current membership option.
          </span>
        </div>

        <div className="cta-row">
          <Link href="/fitness/signup" className="primary-button">
            Review Membership
          </Link>
          <button
            type="button"
            className="secondary-button"
            onClick={() => signOut({ redirectUrl: loginReturnUrl })}
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
          forceRedirectUrl={loginReturnUrl}
          signUpUrl="/fitness/signup"
        />
      </div>

      <div className="cta-row">
        <Link href="/" className="secondary-button">
          Back to AI Coach Directory
        </Link>
      </div>

      <p className="microcopy">
        Newer AI Coach Directory members can sign in normally above. Returning
        Pickaxe Fitness members only need to activate this login once using the
        same email they originally used for Fitness Coach.
      </p>
    </>
  );
}
