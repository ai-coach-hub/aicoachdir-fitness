"use client";

import { useMemo, useRef, useState } from "react";

export default function TermsGate() {
  const scroller = useRef<HTMLDivElement>(null);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const signupUrl = useMemo(
    () => process.env.NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL || "",
    []
  );

  function handleScroll() {
    const el = scroller.current;
    if (!el) return;
    const tolerance = 8;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - tolerance) {
      setReachedBottom(true);
    }
  }

  function continueToSignup() {
    if (!reachedBottom || !agreed || !signupUrl) return;
    const acceptance = {
      termsVersion: "fitness-v1",
      acceptedAt: new Date().toISOString(),
    };
    sessionStorage.setItem("fitnessTermsAcceptance", JSON.stringify(acceptance));
    window.location.assign(signupUrl);
  }

  return (
    <section className="terms-card">
      <div className="terms-heading">
        <p className="eyebrow">STEP 1 OF 2</p>
        <h1>Review the Terms & Conditions</h1>
        <p>You must scroll to the end of the terms and affirm your agreement before continuing to subscription signup.</p>
      </div>

      <div className="terms-scroll" ref={scroller} onScroll={handleScroll} tabIndex={0}>
        <h2>AI Fitness Coach Terms & Conditions</h2>
        <p><strong>Important:</strong> Replace this sample text with your attorney-approved Terms & Conditions before publishing.</p>
        <h3>1. Service</h3>
        <p>The AI Fitness Coach provides automated informational coaching intended to support general fitness planning, motivation, and habit development.</p>
        <h3>2. Not Medical Care</h3>
        <p>The service is not a physician, physical therapist, dietitian, emergency service, or substitute for professional medical evaluation, diagnosis, or treatment.</p>
        <h3>3. Your Responsibilities</h3>
        <p>You are responsible for deciding whether an exercise, activity, or recommendation is appropriate for you and for stopping activity that causes pain, dizziness, unusual shortness of breath, or other concerning symptoms.</p>
        <h3>4. Account and Subscription</h3>
        <p>Access may require a paid subscription. Subscription billing, account access, renewal, cancellation, and payment processing may be handled through the connected Pickaxe and Stripe services.</p>
        <h3>5. AI Limitations</h3>
        <p>AI-generated responses can be incomplete or incorrect. You should independently evaluate recommendations, especially when they relate to health, safety, nutrition, injury, or physical limitations.</p>
        <h3>6. Privacy</h3>
        <p>Do not submit information you do not want processed through the service. Your final published terms should link to and incorporate your approved privacy policy and describe applicable data practices.</p>
        <h3>7. Billing and Cancellation</h3>
        <p>Your final published terms should state the subscription price, billing frequency, renewal terms, cancellation process, refund policy, and how changes to pricing or service will be handled.</p>
        <h3>8. Acceptable Use</h3>
        <p>You agree not to misuse the service, interfere with its operation, attempt unauthorized access, or use it for unlawful purposes.</p>
        <h3>9. Availability</h3>
        <p>Service availability can vary due to maintenance, third-party services, model providers, connectivity, or other operational conditions.</p>
        <h3>10. Changes</h3>
        <p>Your final terms should explain how updated terms are communicated and when revised terms become effective.</p>
        <h3>11. Contact</h3>
        <p>Your final terms should include the correct legal business name, contact information, governing law, and any required consumer notices.</p>
        <div className="terms-end"><strong>End of Terms</strong><span>✓ You have reached the bottom.</span></div>
      </div>

      <div className="agreement-area">
        <label className={reachedBottom ? "check-row" : "check-row disabled"}>
          <input
            type="checkbox"
            checked={agreed}
            disabled={!reachedBottom}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>I have read and agree to the Terms & Conditions.</span>
        </label>

        {!reachedBottom && <p className="status-note">Scroll through the complete terms to unlock agreement.</p>}
        {reachedBottom && !agreed && <p className="status-note success">Terms reviewed. Check the box to continue.</p>}

        <button
          className="primary-button full-button"
          disabled={!reachedBottom || !agreed || !signupUrl}
          onClick={continueToSignup}
        >
          Continue to Secure Subscription
        </button>

        {!signupUrl && (
          <p className="config-warning">
            Developer setup required: add NEXT_PUBLIC_PICKAXE_FITNESS_SIGNUP_URL in Vercel Environment Variables.
          </p>
        )}
        <p className="microcopy center">Step 2 opens your Pickaxe-hosted signup/subscription experience connected to Stripe.</p>
      </div>
    </section>
  );
}
