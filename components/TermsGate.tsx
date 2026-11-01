"use client";

import { useUser } from "@clerk/nextjs";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FITNESS_INCLUDED_USES,
  FITNESS_PLAN,
  FITNESS_PRICE,
  tierTermsSelection,
  TERMS_ACCEPTANCE_TEXT,
  TERMS_VERSION,
} from "@/lib/termsAcceptance";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TermsGate({ children, destination = "fitness", tierSignupsEnabled = false }: { children: ReactNode; destination?: "fitness" | "budget-coach"; tierSignupsEnabled?: boolean }) {
  const [tier,setTier]=useState("growth");
  const selected=tierSignupsEnabled?tierTermsSelection(tier):null;
  const scroller = useRef<HTMLDivElement | null>(null);
  const filledFromLogin = useRef(false);
  const { isSignedIn, user } = useUser();
  const signedInEmail = user?.primaryEmailAddress?.emailAddress || "";
  const [reachedBottom, setReachedBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");


  useEffect(() => {
    if (isSignedIn && signedInEmail && !filledFromLogin.current) {
      filledFromLogin.current = true;
      setEmail((current) => current || signedInEmail);
    }
  }, [isSignedIn, signedInEmail]);

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
    if (!reachedBottom || !agreed || !emailIsValid || isSaving) return;

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
          ...(tierSignupsEnabled?{tier}:{}),
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
        plan: selected?.plan || FITNESS_PLAN,
        price: selected?.price || FITNESS_PRICE,
        includedUses: selected?.includedUses || FITNESS_INCLUDED_USES,
      };

      try {
        sessionStorage.setItem("fitnessTermsAcceptance", JSON.stringify(acceptance));
      } catch {
        // Browser storage is only a secondary convenience. The server record already exists.
      }

      const tierQuery=tierSignupsEnabled?`&tier=${tier}`:"";
      window.location.assign(
        isSignedIn
          ? `/fitness/subscribe?destination=${destination}${tierQuery}`
          : `/fitness/create-account?destination=${destination}${tierQuery}`
      );
    } catch {
      setSaveError("We couldn't record your agreement. Please try again. You have not been charged.");
      setIsSaving(false);
    }
  }

  return (
    <section className="terms-card">
      <div className="terms-heading">
        <p className="eyebrow">{isSignedIn ? "MEMBERSHIP REACTIVATION" : "NEW SUBSCRIBER · STEP 1 OF 3"}</p>
        <h1>Review the Terms & Conditions</h1>
        <p>
          Read the complete terms below. The agreement checkbox unlocks only after you scroll to the end.
        </p>
      </div>

      {tierSignupsEnabled && <fieldset className="terms-tier-chooser" disabled={isSaving}>
        <legend>Choose your monthly membership</legend>
        <div className="terms-tier-options">
          {([
            {id:"starter",name:"Starter",price:"$9",messages:100},
            {id:"growth",name:"Growth",price:"$15",messages:200},
            {id:"premium",name:"Premium",price:"$25",messages:400},
            {id:"elite",name:"Elite",price:"$35",messages:600},
          ] as const).map(plan => (
            <label key={plan.id} className={`terms-tier-option${tier===plan.id?" is-selected":""}`}>
              <input type="radio" name="membership-tier" value={plan.id} checked={tier===plan.id}
                onChange={() => {setTier(plan.id);setAgreed(false);setSaveError("");}}
                disabled={isSaving} />
              <span className="terms-tier-option-top">
                <strong>{plan.name}</strong>
                <span className="terms-tier-radio-mark" aria-hidden="true" />
              </span>
              <span className="terms-tier-price">{plan.price}<small>/month</small></span>
              <span className="terms-tier-messages">{plan.messages} AI Coach messages</span>
            </label>
          ))}
        </div>
      </fieldset>}
      <div className="plan-summary" aria-label="Subscription summary">
        <div><span>Plan</span><strong>{selected?.plan || FITNESS_PLAN}</strong></div>
        <div><span>Price</span><strong>{selected?.price || FITNESS_PRICE} </strong></div>
        <div><span>AI Coach Messages</span><strong>{selected?.includedUses || FITNESS_INCLUDED_USES} messages / month</strong></div>
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
            Enter the email you will use for your AI Coach Directory account. This allows us to maintain a durable record of your Terms acceptance.
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
              : "Use the same email address when you create or sign in to your AI Coach Directory account."}
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
          <strong>{isSignedIn ? "Your existing login will be reused" : "First-time signup reminder"}</strong>
          <span>{isSignedIn
            ? "You will not need to create another account. Your existing workouts and coach history stay associated with this email."
            : "After you create your AI Coach Directory account, look for the verification email. If you do not see it within a few minutes, please check your Spam or Junk folder."}</span>
        </div>

        {saveError && (
          <p className="acceptance-save-error" role="alert">{saveError}</p>
        )}

        <button
          className="primary-button full-button"
          disabled={!reachedBottom || !agreed || !emailIsValid || isSaving}
          onClick={continueToSignup}
        >
          {isSaving ? "Recording Your Agreement…" : isSignedIn ? "Continue to Reactivate Membership" : "Continue to Create Your Account"}
        </button>


        <p className="microcopy center">
          {isSignedIn
            ? "Next, your existing account will continue to secure billing verification without another signup."
            : "Step 2 creates your AI Coach Directory sign-in. Step 3 completes the secure AI Coach Directory membership."}
        </p>
      </div>
    </section>
  );
}
