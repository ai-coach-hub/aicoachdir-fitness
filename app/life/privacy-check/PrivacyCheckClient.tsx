"use client";

import { useState } from "react";

type Proof = {
  ok: boolean;
  passed?: boolean;
  completedSessions?: number;
  twoAccountCheckComplete?: boolean;
  error?: string;
};

export default function LifePrivacyCheckClient() {
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<Proof | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setProof(null);
    try {
      const response = await fetch("/api/life/privacy-check", {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json() as Proof;
      setProof(body);
    } catch {
      setProof({ok: false, error: "The privacy check could not connect."});
    } finally {
      setBusy(false);
    }
  }

  return <section style={{display:"grid",gap:16,maxWidth:640}}>
    <p style={{margin:0}}>
      This verifies your signed-in account against its own private conversation
      history and rejects a different test account&apos;s conversation ID. It
      does not call Pickaxe, change billing, or consume AI uses.
    </p>
    <button type="button" className="primary-button" disabled={busy}
      onClick={() => { void run(); }}>
      {busy ? "Checking privacy..." : "Run zero-credit privacy check"}
    </button>
    {proof?.ok && proof.passed && <div role="status" style={{display:"grid",gap:10}}>
      <strong style={{color:"#9de482"}}>This account passed its privacy check.</strong>
      <p style={{margin:0}}>Foreign chat access: denied. Your own history: scoped to this account.</p>
      <p style={{margin:0}}>
        {proof.twoAccountCheckComplete
          ? "Both independent test-account sessions have now passed."
          : "One session confirmed. Run this same page while signed in to the second approved internal test account."}
      </p>
      <p style={{margin:0}}>Approved test sessions confirmed: {proof.completedSessions ?? 1} of 2.</p>
    </div>}
    {proof && !proof.ok && <p role="alert" style={{color:"#ffd39d",margin:0}}>
      {proof.error || "Privacy check not completed."}
    </p>}
    <p style={{fontSize:13,opacity:0.8,margin:0}}>
      The test records only an approved account identifier and the time of a
      successful check in the isolated preview database. It never shows or saves
      another member&apos;s messages.
    </p>
  </section>;
}
