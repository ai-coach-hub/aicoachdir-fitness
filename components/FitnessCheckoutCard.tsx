"use client";

import { useState } from "react";

export default function FitnessCheckoutCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<{
    url: string;
    label: string;
  } | null>(null);

  async function startCheckout() {
    if (loading) return;
    setLoading(true);
    setError("");
    setErrorAction(null);

    try {
      const response = await fetch("/fitness/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            url?: string;
            error?: string;
            actionUrl?: string;
            actionLabel?: string;
          }
        | null;

      if (!response.ok || !data?.ok || !data.url) {
        setError(
          data?.error ||
            "Secure checkout could not be started. No charge was attempted.",
        );
        if (data?.actionUrl && data?.actionLabel) {
          setErrorAction({ url: data.actionUrl, label: data.actionLabel });
        }
        setLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setError("Secure checkout could not be started. No charge was attempted.");
      setErrorAction(null);
      setLoading(false);
    }
  }

  return (
    <section className="login-config-card" aria-labelledby="fitness-checkout-heading">
      <p className="eyebrow">NEW SUBSCRIBER · STEP 3 OF 3</p>
      <h1 id="fitness-checkout-heading">Complete your Fitness Coach membership</h1>
      <p>
        You are signed into AI Coach Directory. Continue to secure checkout for
        the $15/month AI Fitness Coach 2.0 membership with 400 uses per month.
      </p>

      <button
        type="button"
        className="primary-button full-button"
        onClick={startCheckout}
        disabled={loading}
      >
        {loading ? "Opening Secure Checkout…" : "Continue to Secure Checkout"}
      </button>

      {error ? (
        <p className="acceptance-save-error checkout-error" role="alert">
          <span>{error}</span>
          {errorAction ? (
            <a href={errorAction.url}>
              {errorAction.label} →
            </a>
          ) : null}
        </p>
      ) : null}

      <p className="microcopy center">
        Your subscription renews automatically until canceled. You will return
        directly to Coach + My Workouts after checkout is confirmed.
      </p>
    </section>
  );
}
