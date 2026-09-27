"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  FITNESS_INCLUDED_USES,
  FITNESS_PLAN,
  FITNESS_PRICE,
  TERMS_ACCEPTANCE_TEXT,
  TERMS_VERSION,
} from "@/lib/termsAcceptance";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TermsGate({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const signupUrl = useMemo(
    () => process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "",
    []
  );

  const normalizedEmail = email.trim().toLowerCase();
  const emailIsValid =
    normalizedEmail.length > 0 &&
    normalizedEmail.length <= 254 &&
    EMAIL_PATTERN.test(normalizedEmail);

  function handleScroll() {
    const el = scroller.current;
    if (!el) return;
    const tolerance = 10;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - tolerance) {
      setReachedBottom(true);
    }
  }

  async function continueToSignup() {
    if (!reachedBottom || !agreed || !emailIsValid || !signupUrl || isSaving) return;

    setIsSaving(true);
    setSaveError("");
    const clientAcceptedAt = new Date().toISOString();

    try {
      const response = await fetch("/api/terms-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          email: normalizedEmail,
          clientAcceptedAt,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; acceptanceId?: string; acceptedAt?: string; message?: string }
        | null;

      if (!response.ok || !result?.ok || !result.acceptanceId || !result.acceptedAt) {
        setSaveError(
          result?.message ||
            "We couldn't record your agreement. Please try again. You have not been charged."
        );
        setIsSaving(false);
        return;
      }

      const acceptance = {
        acceptanceId: result.acceptanceId,
        email: normalizedEmail,
        termsVersion: TERMS_VERSION,
        acceptedAt: result.acceptedAt,
        clientAcceptedAt,
        acceptanceText: TERMS_ACCEPTANCE_TEXT,
        plan: FITNESS_PLAN,
        price: FITNESS_PRICE,
        includedUses: FITNESS_INCLUDED_USES,
      };

      try {
        sessionStorage.setItem("fitnessTermsAcceptance", JSON.stringify(acceptance));
      } catch {
        // Browser storage is only a secondary convenience. The server record already exists.
      }

      window.location.assign(signupUrl);
    } catch {
      setSaveError("We couldn't record your agreement. Please try again. You have not been charged.");
      setIsSaving(false);
    }
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
        <div><span>Plan</span><strong>{FITNESS_PLAN}</strong></div>
        <div><span>Price</span><strong>$15 / month</strong></div>
        <div><span>Included usage</span><strong>{FITNESS_INCLUDED_USES} uses / month</strong></div>
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
        <div className="acceptance-email-field">
          <label htmlFor="terms-acceptance-email">Email address</label>
          <p>
            Enter the email you will use to create your account in the next step. This allows us to maintain a record of your Terms acceptance.
          </p>
          <input
            id="terms-acceptance-email"
            name="terms-acceptance-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onBlur={() => setEmailTouched(true)}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setEmail(e.target.value);
              setSaveError("");
            }}
            placeholder="you@example.com"
            aria-invalid={emailTouched && !emailIsValid}
            aria-describedby="terms-email-help"
          />
          <span id="terms-email-help" className={emailTouched && !emailIsValid ? "email-help error" : "email-help"}>
            {emailTouched && !emailIsValid
              ? "Please enter a valid email address."
              : "Use the same email address when you create your Pickaxe account."}
          </span>
        </div>

        <label className={reachedBottom ? "check-row" : "check-row disabled"}>
          <input
            type="checkbox"
            checked={agreed}
            disabled={!reachedBottom || isSaving}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setAgreed(e.target.checked);
              setSaveError("");
            }}
          />
          <span>{TERMS_ACCEPTANCE_TEXT}</span>
        </label>

        {!reachedBottom && (
          <p className="status-note">Scroll through the complete Terms & Conditions to unlock agreement.</p>
        )}
        {reachedBottom && !agreed && (
          <p className="status-note success">You reached the end. Check the agreement box to continue.</p>
        )}

        <div className="verification-reminder" role="note" aria-label="Verification email reminder">
          <strong>First-time signup reminder</strong>
          <span>After you continue to Pickaxe and create your account, look for the verification email. If you do not see it within a few minutes, please check your Spam or Junk folder.</span>
        </div>

        {saveError && (
          <p className="acceptance-save-error" role="alert">{saveError}</p>
        )}

        <button
          className="primary-button full-button"
          disabled={!reachedBottom || !agreed || !emailIsValid || !signupUrl || isSaving}
          onClick={continueToSignup}
        >
          {isSaving ? "Recording Your Agreement…" : "Continue to Secure Subscription"}
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
