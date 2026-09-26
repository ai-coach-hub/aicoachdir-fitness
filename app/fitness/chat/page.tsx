"use client";

import { FormEvent, useState } from "react";

type Message = { role: "user" | "assistant"; text: string };

type ChatResult = {
  ok?: boolean;
  response?: string;
  error?: string;
  conversationId?: string;
  relaySource?: string;
};

export default function FitnessChatPage() {
  const [conversationId, setConversationId] = useState(() => `fitness-chat-${crypto.randomUUID()}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || running) return;

    setMessages((items) => [...items, { role: "user", text: message }]);
    setInput("");
    setRunning(true);
    setStatus("");

    try {
      const response = await fetch("/api/fitness/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      });

      const data = (await response.json()) as ChatResult;
      if (data.conversationId) setConversationId(data.conversationId);

      if (!response.ok || !data.ok || !data.response) {
        setStatus(data.error || "The Fitness Coach request did not complete.");
        return;
      }

      setMessages((items) => [...items, { role: "assistant", text: data.response! }]);
      setStatus(data.relaySource === "action-final-delivery" ? "Validated workout response" : "");
    } catch {
      setStatus("The Fitness Coach request failed.");
    } finally {
      setRunning(false);
    }
  }

  function newChat() {
    setConversationId(`fitness-chat-${crypto.randomUUID()}`);
    setMessages([]);
    setStatus("");
  }

  function memberLogin() {
    const search = typeof window !== "undefined" ? window.location.search : "";
    window.location.assign(`/fitness/login${search}`);
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 80px", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 24 }}>
        <div>
          <p style={{ fontWeight: 800, letterSpacing: "0.08em", fontSize: 12, margin: 0 }}>MEMBER FITNESS COACH</p>
          <h1 style={{ margin: "6px 0 0" }}>AI Fitness Coach</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={newChat}>New chat</button>
          <button type="button" onClick={memberLogin}>Member login</button>
        </div>
      </div>

      <p style={{ lineHeight: 1.6 }}>
        Chat with your Fitness Coach, review your saved workouts, and make changes to your plan.
      </p>

      <section style={{ display: "grid", gap: 14, margin: "28px 0" }}>
        {messages.length === 0 ? (
          <div
            style={{
              padding: 20,
              border: "1px solid rgba(116, 182, 215, 0.26)",
              borderRadius: 12,
              background: "rgba(7, 16, 27, 0.96)",
              color: "#f7fbff",
            }}
          >
            Ask the Fitness Coach anything, or request a workout plan.
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              padding: 16,
              borderRadius: 12,
              border: "1px solid rgba(116, 182, 215, 0.26)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.55,
              color: "#f7fbff",
              background:
                message.role === "assistant"
                  ? "rgba(13, 26, 43, 0.96)"
                  : "rgba(7, 16, 27, 0.96)",
            }}
          >
            <strong>{message.role === "assistant" ? "Coach" : "You"}</strong>
            <div style={{ marginTop: 8 }}>{message.text}</div>
          </div>
        ))}
      </section>

      <form onSubmit={send}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={5}
          placeholder="What are we working on today?"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 14,
            borderRadius: 10,
            border: "1px solid rgba(116, 182, 215, 0.34)",
            background: "#050d18",
            color: "#f7fbff",
            font: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
          <button type="submit" disabled={running || !input.trim()}>
            {running ? "Working..." : "Send"}
          </button>
          {status ? <span style={{ fontSize: 13 }}>{status}</span> : null}
        </div>
      </form>
    </main>
  );
}
