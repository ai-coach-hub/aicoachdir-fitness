"use client";

import { FormEvent, useEffect, useState } from "react";

const KNEE_TEST =
  "Hypothetical test: deep squats and lunges irritate my right knee, but walking, cycling, and shallow-range leg press feel comfortable. Build me a 30-minute full-body workout that works around that limitation. Do not save this to My Workouts.";

const NO_RESTRICTION_TEST =
  "Hypothetical test: I have no injuries or movement restrictions, and I have no workout equipment available. Build me a 30-minute full-body workout. Do not save this to My Workouts.";

type ValidatorResult = {
  ok?: boolean;
  blocked?: boolean;
  response?: string;
  error?: string;
  conversationId?: string;
  violations?: Array<{ code: string; label: string; excerpt: string }>;
  relaySource?: string;
  actionRunCount?: number;
  actionRunId?: string | null;
  missingConfiguration?: string[];
};

export default function WorkoutResponseValidatorPage() {
  const [message, setMessage] = useState(KNEE_TEST);
  const [token, setToken] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [result, setResult] = useState<ValidatorResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const savedToken = sessionStorage.getItem("qaWorkoutValidatorToken") || "";
    const savedConversation =
      sessionStorage.getItem("qaWorkoutValidatorConversation") || `qa-validator-${crypto.randomUUID()}`;
    setToken(savedToken);
    setConversationId(savedConversation);
    sessionStorage.setItem("qaWorkoutValidatorConversation", savedConversation);
  }, []);

  async function runTest(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    setResult(null);

    try {
      sessionStorage.setItem("qaWorkoutValidatorToken", token);
      const response = await fetch("/api/qa/workout-response-validator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-qa-validator-token": token,
        },
        body: JSON.stringify({ message, conversationId }),
      });

      const data = (await response.json()) as ValidatorResult;
      if (data.conversationId) {
        setConversationId(data.conversationId);
        sessionStorage.setItem("qaWorkoutValidatorConversation", data.conversationId);
      }
      setResult(data);
    } catch {
      setResult({ ok: false, error: "The preview request failed." });
    } finally {
      setRunning(false);
    }
  }

  function newConversation() {
    const next = `qa-validator-${crypto.randomUUID()}`;
    setConversationId(next);
    sessionStorage.setItem("qaWorkoutValidatorConversation", next);
    setResult(null);
  }

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "40px 20px 80px",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111827",
      }}
    >
      <p style={{ fontWeight: 800, letterSpacing: "0.08em", fontSize: 13, marginBottom: 8 }}>
        QA PREVIEW ONLY
      </p>
      <h1 style={{ marginTop: 0 }}>Workout response validator</h1>
      <p style={{ lineHeight: 1.6, maxWidth: 760 }}>
        This preview calls the existing AI Fitness Coach through its server-side Pickaxe deployment,
        then checks the completed answer before displaying it. A blocked response is not shown as an
        approved workout.
      </p>

      <div
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 14,
          padding: 18,
          margin: "24px 0",
          background: "#f9fafb",
        }}
      >
        <strong>Isolation guard:</strong> the API route returns 404 outside Vercel Preview/local
        development. It does not replace the live member portal.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <button type="button" onClick={() => { setMessage(KNEE_TEST); setResult(null); }}>
          Load knee-restriction test
        </button>
        <button type="button" onClick={() => { setMessage(NO_RESTRICTION_TEST); setResult(null); }}>
          Load no-restriction baseline
        </button>
        <button type="button" onClick={newConversation}>
          New QA conversation
        </button>
      </div>

      <form onSubmit={runTest}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
          QA validator token
        </label>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 12,
            border: "1px solid #9ca3af",
            borderRadius: 8,
            marginBottom: 18,
          }}
        />

        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
          Test message
        </label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={8}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 12,
            border: "1px solid #9ca3af",
            borderRadius: 8,
            font: "inherit",
          }}
        />

        <p style={{ fontSize: 13, color: "#4b5563" }}>
          Conversation: <code>{conversationId || "initializing..."}</code>
        </p>

        <button
          type="submit"
          disabled={running || !message.trim()}
          style={{
            marginTop: 8,
            padding: "12px 18px",
            fontWeight: 800,
            borderRadius: 8,
            border: 0,
            cursor: running ? "wait" : "pointer",
          }}
        >
          {running ? "Running..." : "Run validated test"}
        </button>
      </form>

      {result ? (
        <section style={{ marginTop: 32 }}>
          {result.blocked ? (
            <div
              style={{
                border: "2px solid #991b1b",
                borderRadius: 12,
                padding: 18,
                background: "#fef2f2",
              }}
            >
              <h2 style={{ marginTop: 0 }}>BLOCKED by deterministic validator</h2>
              <p>
                The Pickaxe response contained one or more items that violated the explicit
                restriction contract. The response was withheld.
              </p>
              <ul>
                {(result.violations || []).map((violation, index) => (
                  <li key={`${violation.code}-${index}`} style={{ marginBottom: 12 }}>
                    <strong>{violation.label}</strong>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      <code>{violation.excerpt}</code>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : result.ok ? (
            <div
              style={{
                border: "2px solid #166534",
                borderRadius: 12,
                padding: 18,
                background: "#f0fdf4",
              }}
            >
              <h2 style={{ marginTop: 0 }}>PASS — response cleared validation</h2>
              <p style={{ fontSize: 13, color: "#166534" }}>
                Relay source: <code>{result.relaySource || "unknown"}</code>
                {typeof result.actionRunCount === "number"
                  ? <> · Action runs in session: <code>{result.actionRunCount}</code></>
                  : null}
              </p>
              <pre style={{ whiteSpace: "pre-wrap", font: "inherit", lineHeight: 1.6 }}>
                {result.response}
              </pre>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid #b45309",
                borderRadius: 12,
                padding: 18,
                background: "#fffbeb",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Preview request did not complete</h2>
              <p>{result.error || "Unknown error."}</p>
              {result.missingConfiguration?.length ? (
                <div>
                  <p><strong>Missing configuration:</strong></p>
                  <ul>
                    {result.missingConfiguration.map((item) => (
                      <li key={item}><code>{item}</code></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
