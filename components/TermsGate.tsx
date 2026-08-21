"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { TERMS_VERSION } from "@/lib/termsMeta";

const ACCEPTANCE_TEXT =
  "I have read and agree to the Terms & Conditions and acknowledge the Privacy Policy, including the arbitration agreement, class-action waiver, AI limitations, fitness assumption-of-risk provisions, and automatic-renewal terms. I confirm that I am at least 18 years old.";

export default function TermsGate({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const signupUrl = useMemo(
    () => process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "",
    []
  );

  function handleScroll() {
    const el = scroller.current;
    if (!el) return;
    const tolerance = 10;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - tolerance) {
      setReachedBottom(true);
    }
  }

  function continueToSignup() {
    if (!reachedBottom || !agreed || !signupUrl) return;

    const acceptance = {
      termsVersion: TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
      acceptanceText: ACCEPTANCE_TEXT,
      plan: "AI Fitness Coach 2.0",
      price: "$15/month",
      includedUses: 400,
    };

    sessionStorage.setItem("fitnessTermsAcceptance", JSON.stringify(acceptance));
    window.location.assign(signupUrl);
  }

  return (
    <section className="terms-card">
      <div className="terms-heading">
        <p className="eyebrow">NEW SUBSCRIBER · STEP 1 OF 2</p>
        <h1>Review the Terms & Conditions</h1>
        <p>
          Read the complete terms below. The agreement checkbox unlocks only after you scroll to the end.
        </p>
      </div>

      <div className="plan-summary" aria-label="Subscription summary">
        <div><span>Plan</span><strong>AI Fitness Coach 2.0</strong></div>
        <div><span>Price</span><strong>$15 / month</strong></div>
        <div><span>Included usage</span><strong>400 uses / month</strong></div>
        <div><span>Renewal</span><strong>Automatic until canceled</strong></div>
      </div>

      <div
        className="terms-scroll"
        ref={scroller}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label="Terms and Conditions. Scroll to the end to enable agreement."
      >
        {children}
        <div className="terms-end">
          <strong>End of Terms & Conditions</strong>
          <span>✓ You have reached the end.</span>
        </div>
      </div>

      <div className="agreement-area">
        <label className={reachedBottom ? "check-row" : "check-row disabled"}>
          <input
            type="checkbox"
            checked={agreed}
            disabled={!reachedBottom}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setAgreed(e.target.checked)}
          />
          <span>{ACCEPTANCE_TEXT}</span>
        </label>

        {!reachedBottom && (
          <p className="status-note">Scroll through the complete Terms & Conditions to unlock agreement.</p>
        )}
        {reachedBottom && !agreed && (
          <p className="status-note success">You reached the end. Check the agreement box to continue.</p>
        )}

        <div className="verification-reminder" role="note" aria-label="Verification email reminder">
          <strong>First-time signup reminder</strong>
          <span>After you enter your email in the next step, look for the verification email. If you do not see it within a few minutes, please check your Spam or Junk folder.</span>
        </div>

        <button
          className="primary-button full-button"
          disabled={!reachedBottom || !agreed || !signupUrl}
          onClick={continueToSignup}
        >
          Continue to Secure Subscription
        </button>

        {!signupUrl && (
          <p className="config-warning">
            Setup required: add NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL in Vercel Environment Variables.
          </p>
        )}

        <p className="microcopy center">
          Step 2 opens the Pickaxe-hosted membership and subscription flow connected to Stripe.
        </p>
      </div>
    </section>
  );
}
