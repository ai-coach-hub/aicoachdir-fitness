"use client";

import { useState } from "react";

export default function FitnessCheckoutCard({ destination = "fitness", tierSignupsEnabled = false }: { destination?: "fitness" | "budget-coach"; tierSignupsEnabled?: boolean }) {
  const [tier,setTier] = useState("growth");
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
      const response = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ destination, ...(tierSignupsEnabled ? {tier} : {}) }),
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
      {tierSignupsEnabled ? <>
        <p>Choose a monthly membership. Every plan includes Fitness, Budgeting, and Life Coach.</p>
        <label htmlFor="membership-tier">Monthly membership plan</label>
        <select id="membership-tier" value={tier} disabled={loading} onChange={e=>setTier(e.target.value)} style={{display:"block",width:"100%",padding:12,margin:"12px 0 20px"}}>
          <option value="starter">Starter — $9/month · 100 messages</option>
          <option value="growth">Growth — $15/month · 200 messages</option>
          <option value="premium">Premium — $25/month · 400 messages</option>
          <option value="elite">Elite — $35/month · 600 messages</option>
        </select>
      </> : <p>Your existing sign-in will be kept. Continue to secure checkout for the $15/month AI Coach Directory membership, which includes Fitness, Budgeting, and Life Coach with 400 AI Coach messages per month. If you are returning after cancellation, your existing account stays the same.</p>}

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
        Your subscription renews automatically until canceled. After checkout is confirmed, you can open your selected coach or return to your member dashboard.
      </p>
    </section>
  );
}
