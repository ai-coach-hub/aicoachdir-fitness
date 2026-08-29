"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./coach.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const THREAD_STORAGE_KEY = "fitness-coach-thread-v2";

function createThreadId() {
  return crypto.randomUUID().replaceAll("-", "");
}

export default function CoachChat() {
  const [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem(THREAD_STORAGE_KEY);
    const next = existing || createThreadId();

    if (!existing) {
      window.localStorage.setItem(THREAD_STORAGE_KEY, next);
    }

    setThreadId(next);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();

    if (!message || !threadId || sending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: message,
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput("");
    setError("");
    setSending(true);

    try {
      const response = await fetch("/api/fitness-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId }),
      });

      const data = await response.json();

      if (!response.ok || !data?.reply) {
        throw new Error(data?.error || "Unable to reach the Fitness Coach.");
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.reply,
      };

      setMessages((previous) => [...previous, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reach the Fitness Coach."
      );
    } finally {
      setSending(false);
    }
  }

  function newConversation() {
    const next = createThreadId();
    window.localStorage.setItem(THREAD_STORAGE_KEY, next);
    setThreadId(next);
    setMessages([]);
    setError("");
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>AI Coach Directory™</div>
            <h1>AI Fitness Coach 2.0</h1>
            <p>Your coach, workout planning, and progress support in one place.</p>
          </div>

          <nav className={styles.actions} aria-label="Fitness member navigation">
            <Link href="/member" className={styles.secondaryButton}>
              Member Home
            </Link>
            <Link href="/my-workouts" className={styles.primaryButton}>
              My Workouts
            </Link>
          </nav>
        </header>

        <section className={styles.chatPanel}>
          <div className={styles.chatTopbar}>
            <div>
              <strong>Fitness Coach</strong>
              <span>Membership verified</span>
            </div>
            <button
              type="button"
              className={styles.newChatButton}
              onClick={newConversation}
            >
              New conversation
            </button>
          </div>

          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? (
              <div className={styles.welcome}>
                <h2>What would you like to work on?</h2>
                <p>
                  Ask for a workout plan, adjust an existing plan, get help with
                  an exercise, or tell your coach what changed today.
                </p>
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${
                  message.role === "user"
                    ? styles.userMessage
                    : styles.assistantMessage
                }`}
              >
                <div className={styles.messageLabel}>
                  {message.role === "user" ? "You" : "Coach"}
                </div>
                <div className={styles.messageText}>{message.text}</div>
              </div>
            ))}

            {sending ? (
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={styles.messageLabel}>Coach</div>
                <div className={styles.typing}>Thinking…</div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          <form className={styles.composer} onSubmit={sendMessage}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Message your Fitness Coach…"
              rows={3}
              maxLength={8000}
              disabled={sending}
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!input.trim() || !threadId || sending}
            >
              Send
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
