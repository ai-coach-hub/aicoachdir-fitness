"use client";

import { useState } from "react";

export default function FitnessCheckoutCard({ destination = "fitness" }: { destination?: "fitness" | "budget-coach" }) {
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
        body: JSON.stringify({ destination }),
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
      <p className="eyebrow">MEMBERSHIP · SECURE CHECKOUT</p>
      <h1 id="fitness-checkout-heading">Confirm your AI Coach Directory membership</h1>
      <p>
        Your existing sign-in will be kept. Continue to secure checkout for
        the $15/month AI Coach Directory membership, which currently includes Fitness and Budgeting with 400 AI Coach Messages per month. If you are returning after cancellation, your existing account stays the same.
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
        to the coach you selected after checkout is confirmed.
      </p>
    </section>
  );
}
