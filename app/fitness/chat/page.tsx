"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Message = { role: "user" | "assistant"; text: string };
type JsonRecord = Record<string, unknown>;

type ChatResult = {
  ok?: boolean;
  response?: string;
  error?: string;
  conversationId?: string;
  relaySource?: string;
};

type PlanResult = {
  ok?: boolean;
  plan?: JsonRecord | null;
  historyEntries?: unknown[];
  error?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function workoutMap(plan: JsonRecord | null) {
  const workouts = asRecord(plan?.workouts);
  return workouts || {};
}

function scheduleRows(plan: JsonRecord | null) {
  if (!plan) return [];
  const fixed = Array.isArray(plan.weekSchedule) ? plan.weekSchedule : [];
  const flexible = Array.isArray(plan.flexibleSequence) ? plan.flexibleSequence : [];
  return (fixed.length ? fixed : flexible)
    .map(asRecord)
    .filter((row): row is JsonRecord => !!row);
}

function nextSavedPlan(plan: JsonRecord | null) {
  const wrapper = asRecord(plan?.nextPlan);
  if (!wrapper) return null;
  const nested = asRecord(wrapper.plan);
  const candidate = nested || wrapper;
  return scheduleRows(candidate).length ? candidate : null;
}

function workoutTitle(workout: JsonRecord | null, fallback: string) {
  return String(workout?.title || workout?.name || fallback || "Workout");
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function scheduleRange(rows: JsonRecord[]) {
  const dates = rows
    .map((row) => String(row.date || ""))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (!dates.length) return "";
  const first = formatDate(dates[0]);
  const last = formatDate(dates[dates.length - 1]);
  return first && last ? `${first}–${last}` : first || last;
}

function exerciseLabel(value: unknown) {
  const exercise = asRecord(value);
  if (!exercise) return "";
  return String(exercise.name || exercise.title || exercise.exercise || "").trim();
}

export default function FitnessChatPage() {
  const [tab, setTab] = useState<"coach" | "workouts">("coach");
  const [conversationId, setConversationId] = useState(() => `fitness-chat-${crypto.randomUUID()}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState<JsonRecord | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState("");

  async function loadPlan() {
    setPlanLoading(true);
    setPlanError("");
    try {
      const response = await fetch("/api/fitness/chat", { method: "GET", cache: "no-store" });
      const data = (await response.json()) as PlanResult;
      if (!response.ok || !data.ok) {
        setPlanError(data.error || "Saved workouts could not be loaded.");
        return;
      }
      setPlan(data.plan || null);
      setHistory(Array.isArray(data.historyEntries) ? data.historyEntries : []);
    } catch {
      setPlanError("Saved workouts could not be loaded.");
    } finally {
      setPlanLoading(false);
    }
  }

  useEffect(() => {
    void loadPlan();
  }, []);

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
      setStatus(data.relaySource === "action-final-delivery" ? "Workout updated and validated." : "");
      if (data.relaySource === "action-final-delivery") {
        await loadPlan();
      }
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

  const currentWorkouts = useMemo(() => workoutMap(plan), [plan]);
  const rows = useMemo(() => scheduleRows(plan), [plan]);
  const upcomingPlan = useMemo(() => nextSavedPlan(plan), [plan]);
  const upcomingWorkouts = useMemo(() => workoutMap(upcomingPlan), [upcomingPlan]);
  const upcomingRows = useMemo(() => scheduleRows(upcomingPlan), [upcomingPlan]);
  const workouts = useMemo(
    () => ({ ...upcomingWorkouts, ...currentWorkouts }),
    [currentWorkouts, upcomingWorkouts],
  );
  const workoutList = useMemo(
    () =>
      Object.entries(workouts)
        .map(([id, raw]) => ({ id, workout: asRecord(raw) }))
        .filter((item): item is { id: string; workout: JsonRecord } => !!item.workout),
    [workouts],
  );

  const completedCount = history.filter((entry) => !!asRecord(entry)?.completedAt).length;
  const scheduleMode =
    plan?.scheduleMode === "fixed_weekdays"
      ? "Scheduled by day"
      : plan?.scheduleMode === "flexible_sequence"
        ? "Flexible plan"
        : "Saved plan";

  return (
    <main className="member-hub-shell">
      <header className="member-hub-header">
        <div>
          <p className="eyebrow compact-eyebrow">AI FITNESS COACH 2.0</p>
          <h1>Welcome back.</h1>
          <p>Your coach and saved workouts are connected in one place.</p>
        </div>
        <div className="member-hub-actions">
          <Link href="/" className="secondary-button">Home</Link>
          <button type="button" className="secondary-button" onClick={newChat}>New chat</button>
        </div>
      </header>

      <nav className="member-hub-tabs" aria-label="Member tools">
        <button
          type="button"
          className={tab === "coach" ? "member-tab active" : "member-tab"}
          onClick={() => setTab("coach")}
        >
          Coach
          <span>Chat, adjust, plan</span>
        </button>
        <button
          type="button"
          className={tab === "workouts" ? "member-tab active" : "member-tab"}
          onClick={() => setTab("workouts")}
        >
          My Workouts
          <span>View your saved plan</span>
        </button>
      </nav>

      {tab === "coach" ? (
        <section className="member-coach-layout">
          <div className="member-chat-panel">
            <div className="member-panel-heading">
              <div>
                <p className="eyebrow compact-eyebrow">YOUR COACH</p>
                <h2>What are we working on today?</h2>
              </div>
              <button type="button" className="text-button" onClick={() => setTab("workouts")}>
                View My Workouts
              </button>
            </div>

            <div className="member-chat-messages">
              {messages.length === 0 ? (
                <div className="coach-welcome-card">
                  <strong>Start wherever you are.</strong>
                  <p>Ask for today’s workout, change your plan, talk through recovery, nutrition, equipment, schedule, or progress.</p>
                  <div className="quick-prompts">
                    {[
                      "What should I do today?",
                      "Show me my current plan.",
                      "I need to adjust this week.",
                    ].map((prompt) => (
                      <button key={prompt} type="button" onClick={() => setInput(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message, index) => (
                <article key={index} className={message.role === "assistant" ? "chat-bubble coach" : "chat-bubble user"}>
                  <strong>{message.role === "assistant" ? "Coach" : "You"}</strong>
                  <div>{message.text}</div>
                </article>
              ))}
            </div>

            <form className="member-chat-form" onSubmit={send}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={4}
                placeholder="Message your coach..."
              />
              <div>
                <button type="submit" className="primary-button" disabled={running || !input.trim()}>
                  {running ? "Working..." : "Send"}
                </button>
                {status ? <span className="member-status">{status}</span> : null}
              </div>
            </form>
          </div>

          <aside className="member-plan-glance">
            <p className="eyebrow compact-eyebrow">AT A GLANCE</p>
            <h2>My Workouts</h2>
            {planLoading ? <p>Loading your saved plan...</p> : null}
            {planError ? <p className="member-error">{planError}</p> : null}
            {!planLoading && !planError ? (
              <>
                <div className="plan-glance-stat">
                  <strong>{workoutList.length}</strong>
                  <span>saved workout{workoutList.length === 1 ? "" : "s"}</span>
                </div>
                <div className="plan-glance-stat">
                  <strong>{completedCount}</strong>
                  <span>recent completion{completedCount === 1 ? "" : "s"} logged</span>
                </div>
                <p>{scheduleMode}</p>
                <button type="button" className="secondary-button" onClick={() => setTab("workouts")}>
                  Open My Workouts
                </button>
              </>
            ) : null}
          </aside>
        </section>
      ) : (
        <section className="member-workouts-panel">
          <div className="member-panel-heading">
            <div>
              <p className="eyebrow compact-eyebrow">MY WORKOUTS</p>
              <h2>Your saved plan</h2>
              <p>Changes you make with your coach will appear here after they are saved.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => void loadPlan()}>
              Refresh plan
            </button>
          </div>

          {planLoading ? <div className="workout-empty">Loading your workouts...</div> : null}
          {planError ? <div className="workout-empty member-error">{planError}</div> : null}
          {!planLoading && !planError && !plan ? (
            <div className="workout-empty">
              <strong>No saved workout plan yet.</strong>
              <p>Go to Coach and ask for a plan that fits your goals, schedule, and equipment.</p>
            </div>
          ) : null}

          {!planLoading && !planError && plan ? (
            <>
              <div className="workout-summary-strip">
                <div><span>Plan style</span><strong>{scheduleMode}</strong></div>
                <div><span>Workouts</span><strong>{workoutList.length}</strong></div>
                <div><span>Recent completions</span><strong>{completedCount}</strong></div>
              </div>

              {rows.length ? (
                <section aria-labelledby="current-saved-week">
                  <div className="member-panel-heading">
                    <div>
                      <p className="eyebrow compact-eyebrow">CURRENT SAVED WEEK</p>
                      <h3 id="current-saved-week">{scheduleRange(rows)}</h3>
                    </div>
                  </div>
                  <div className="schedule-grid">
                    {rows.map((row, index) => {
                      const id = String(row.workoutId || "");
                      const workout = asRecord(currentWorkouts[id]) || asRecord(workouts[id]);
                      const rest = row.isRestDay === true || !id;
                      return (
                        <article key={index} className={rest ? "schedule-card rest" : "schedule-card"}>
                          <span>{String(row.day || `Workout ${index + 1}`)}</span>
                          {row.date ? <small>{formatDate(row.date)}</small> : null}
                          <strong>{rest ? "Rest" : workoutTitle(workout, id)}</strong>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {upcomingRows.length ? (
                <section aria-labelledby="next-saved-week">
                  <div className="member-panel-heading">
                    <div>
                      <p className="eyebrow compact-eyebrow">NEXT SAVED WEEK</p>
                      <h3 id="next-saved-week">{scheduleRange(upcomingRows)}</h3>
                    </div>
                  </div>
                  <div className="schedule-grid">
                    {upcomingRows.map((row, index) => {
                      const id = String(row.workoutId || "");
                      const workout = asRecord(upcomingWorkouts[id]) || asRecord(workouts[id]);
                      const rest = row.isRestDay === true || !id;
                      return (
                        <article key={index} className={rest ? "schedule-card rest" : "schedule-card"}>
                          <span>{String(row.day || `Workout ${index + 1}`)}</span>
                          {row.date ? <small>{formatDate(row.date)}</small> : null}
                          <strong>{rest ? "Rest" : workoutTitle(workout, id)}</strong>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <div className="workout-card-grid">
                {workoutList.map(({ id, workout }) => {
                  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
                  const names = exercises.map(exerciseLabel).filter(Boolean);
                  return (
                    <article key={id} className="workout-card">
                      <div className="workout-card-topline">
                        <span>Saved workout</span>
                        {typeof workout.durationMinutes === "number" ? (
                          <strong>{workout.durationMinutes} min</strong>
                        ) : null}
                      </div>
                      <h3>{workoutTitle(workout, id)}</h3>
                      {workout.description ? <p>{String(workout.description)}</p> : null}
                      {names.length ? (
                        <ul>
                          {names.slice(0, 8).map((name, index) => <li key={index}>{name}</li>)}
                        </ul>
                      ) : (
                        <p className="muted-copy">Open Coach to ask about the details or make a change.</p>
                      )}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setTab("coach");
                          setInput(`I want to adjust my "${workoutTitle(workout, id)}" workout.`);
                        }}
                      >
                        Adjust with Coach
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>
      )}
    </main>
  );
}
