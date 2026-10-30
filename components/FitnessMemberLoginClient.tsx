"use client";

import Link from "next/link";
import { SignIn, useClerk, useUser } from "@clerk/nextjs";

type Props = {
  hasAccess: boolean;
  paymentNeedsAttention?: boolean;
  accessCheckFailed: boolean;
  loginReturnUrl: string;
};

export default function FitnessMemberLoginClient({
  hasAccess,
  paymentNeedsAttention = false,
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
            <Link href="/dashboard" className="primary-button">
              Open My Dashboard
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
          <strong>{paymentNeedsAttention ? "Your existing subscription needs a payment update" : "No active membership was found for this account"}</strong>
          <span>
            {paymentNeedsAttention
              ? "Update your payment method or resolve an unpaid invoice. Please don't buy another subscription."
              : "Sign in with the email address associated with your membership. If you already have a subscription, verify it before purchasing another one."}
          </span>
        </div>

        <div className="cta-row">
          <Link href={paymentNeedsAttention
            ? "/manage-subscription"
            : loginReturnUrl.includes("budget")
              ? "/fitness/subscribe?destination=budget-coach"
              : "/fitness/subscribe?destination=fitness"
          } className="primary-button">
            {paymentNeedsAttention ? "Resolve Payment" : "Reactivate Membership"}
          </Link>
          <Link href="/manage-subscription" className="secondary-button">
            Manage existing subscription
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
      <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
        <SignIn
          routing="hash"
          forceRedirectUrl={loginReturnUrl}
          signUpUrl={loginReturnUrl.includes("budget") ? "/fitness/signup?destination=budget-coach" : "/fitness/signup?destination=fitness"}
        />
      </div>

      <p className="microcopy">
        Already subscribed? Sign in with the email you used for your membership.
        Signing in will not create a new charge.
      </p>
      <details className="member-login-help">
        <summary>Need help accessing an older account?</summary>
        <p>If you previously used Fitness Coach and your membership is not recognized, you can connect your existing account without purchasing a new subscription.</p>
        <div className="cta-row">
          <Link href="/fitness/legacy-account" className="secondary-button">Connect existing account</Link>
          <Link href="/manage-subscription" className="secondary-button">Manage subscription</Link>
        </div>
      </details>
      <div className="cta-row">
        <Link href="/" className="secondary-button">
          Back to AI Coach Directory
        </Link>
      </div>

    </>
  );
}
