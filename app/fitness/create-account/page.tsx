"use client";

import Link from "next/link";
import { SignUp, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

type StoredAcceptance = { email?: unknown };

function acceptedEmail() {
  try {
    const raw = sessionStorage.getItem("fitnessTermsAcceptance");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as StoredAcceptance;
    return typeof parsed.email === "string"
      ? parsed.email.trim().toLowerCase()
      : "";
  } catch {
    return "";
  }
}

export default function FitnessCreateAccountPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      window.location.replace("/fitness/subscribe");
      return;
    }

    const value = acceptedEmail();
    if (!value) {
      window.location.replace("/fitness/signup");
      return;
    }

    setEmail(value);
    setReady(true);
  }, [isLoaded, isSignedIn]);

  return (
    <main className="signup-shell">
      <SiteHeader compact />
      <section className="login-config-card" aria-labelledby="create-account-heading">
        <p className="eyebrow">NEW SUBSCRIBER · STEP 2 OF 3</p>
        <h1 id="create-account-heading">Create your AI Coach Directory account</h1>
        <p>
          This is the only account you will use to access your Fitness Coach,
          Budgeting Coach, My Workouts, and My Budget.
        </p>

        {!ready ? (
          <p className="status-note">Preparing account setup…</p>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", margin: "28px 0" }}>
            <SignUp
              routing="hash"
              initialValues={{ emailAddress: email }}
              forceRedirectUrl="/fitness/subscribe"
              signInUrl="/fitness/login"
            />
          </div>
        )}

        <div className="verification-reminder" role="note">
          <strong>Verification email</strong>
          <span>
            Use the same email you entered when accepting the Terms. If the
            verification email does not arrive within a few minutes, check your
            Spam or Junk folder.
          </span>
        </div>

        <div className="cta-row">
          <Link href="/fitness/signup" className="secondary-button">
            Back to Terms
          </Link>
        </div>
      </section>
    </main>
  );
}
