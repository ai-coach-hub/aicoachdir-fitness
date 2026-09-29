"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";

type Message = { role: "user" | "assistant"; text: string };
type JsonRecord = Record<string, unknown>;

type ChatResult = {
  ok?: boolean;
  response?: string;
  error?: string;
  conversationId?: string;
  relaySource?: string;
  actionMode?: string | null;
};

type PlanResult = {
  ok?: boolean;
  plan?: JsonRecord | null;
  historyEntries?: unknown[];
  error?: string;
};

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type HistoryThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: HistoryMessage[];
};

type HistoryResult = {
  ok?: boolean;
  threads?: HistoryThread[];
  error?: string;
};

const COACH_INTROS = [
  "What are we working on today?",
  "Ready to train? Tell me what you want to accomplish.",
  "What kind of workout are you looking for today?",
  "Tell me what you need today. I’ll take it from there.",
  "What would make today’s workout a win?",
  "Where are you starting from, and where do you want to go?",
  "Gym, home, outdoors, or somewhere else—what are we working with today?",
  "Let’s build something that fits you. What are you looking to accomplish?",
] as const;

const COACH_INTRO_STORAGE_KEY = "fitness-coach-last-intro-v1";

function cleanCoachText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/__/g, "");
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function workoutMap(plan: JsonRecord | null) {
  const workouts = asRecord(plan?.workouts);
  return workouts || {};
}

type WorkoutScope = "current" | "next";

function scopedWorkoutEntries(workouts: JsonRecord, scope: WorkoutScope) {
  return Object.entries(workouts).flatMap(([id, raw]) => {
    const workout = asRecord(raw);
    return workout ? [{ key: `${scope}:${id}`, id, workout, scope }] : [];
  });
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

function formatHistoryDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function canResumeThread(id: string) {
  return /^fitness-chat-[A-Za-z0-9_-]{8,120}$/.test(id);
}

export default function FitnessChatPage() {
  const { signOut } = useClerk();
  const [tab, setTab] = useState<"coach" | "workouts" | "history">("coach");
  const [conversationId, setConversationId] = useState(() => `fitness-chat-${crypto.randomUUID()}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState<JsonRecord | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState("");
  const [introPrompt, setIntroPrompt] = useState<string>(COACH_INTROS[0]);
  const [threads, setThreads] = useState<HistoryThread[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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

  async function loadChatHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/fitness/chat/history", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as HistoryResult;
      if (!response.ok || !data.ok) {
        setHistoryError(data.error || "Previous chats could not be loaded.");
        return;
      }
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch {
      setHistoryError("Previous chats could not be loaded.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadPlan();

    try {
      const previous = window.localStorage.getItem(COACH_INTRO_STORAGE_KEY);
      const choices = COACH_INTROS.filter((prompt) => prompt !== previous);
      const pool = choices.length ? choices : COACH_INTROS;
      const random = new Uint32Array(1);
      window.crypto.getRandomValues(random);
      const next = pool[random[0] % pool.length];
      setIntroPrompt(next);
      window.localStorage.setItem(COACH_INTRO_STORAGE_KEY, next);
    } catch {
      setIntroPrompt(COACH_INTROS[0]);
    }
  }, []);

  useEffect(() => {
    if (tab !== "coach") return;
    chatEndRef.current?.scrollIntoView({
      behavior: running ? "smooth" : "auto",
      block: "end",
    });
  }, [messages, running, tab]);

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

      setMessages((items) => [...items, { role: "assistant", text: cleanCoachText(data.response!) }]);
      const validationOnly =
        data.relaySource === "action-final-delivery" &&
        data.actionMode === "validate_workout_feasibility";
      const savedPlanChanged =
        data.relaySource === "action-final-delivery" && !validationOnly;
      setStatus(savedPlanChanged ? "Workout updated and validated." : "");
      if (savedPlanChanged) {
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
    setSelectedThreadId("");
    setTab("coach");
  }

  function reviewThread(thread: HistoryThread) {
    setSelectedThreadId(thread.id);
  }

  function resumeThread(thread: HistoryThread) {
    if (!canResumeThread(thread.id)) return;
    setConversationId(thread.id);
    setMessages(thread.messages);
    setStatus("");
    setSelectedThreadId("");
    setTab("coach");
  }

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId],
  );

  const currentWorkouts = useMemo(() => workoutMap(plan), [plan]);
  const rows = useMemo(() => scheduleRows(plan), [plan]);
  const upcomingPlan = useMemo(() => nextSavedPlan(plan), [plan]);
  const upcomingWorkouts = useMemo(() => workoutMap(upcomingPlan), [upcomingPlan]);
  const upcomingRows = useMemo(() => scheduleRows(upcomingPlan), [upcomingPlan]);
  const workoutList = useMemo(
    () => [
      ...scopedWorkoutEntries(currentWorkouts, "current"),
      ...scopedWorkoutEntries(upcomingWorkouts, "next"),
    ],
    [currentWorkouts, upcomingWorkouts],
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
          <button
            type="button"
            className="secondary-button"
            onClick={() => signOut({ redirectUrl: "/fitness/login" })}
          >
            Sign out
          </button>
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
        <button
          type="button"
          className={tab === "history" ? "member-tab active" : "member-tab"}
          onClick={() => {
            setTab("history");
            setSelectedThreadId("");
            void loadChatHistory();
          }}
        >
          Previous Chats
          <span>Review old conversations</span>
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

            <div className={messages.length === 0 ? "member-chat-messages is-empty" : "member-chat-messages"}>
              {messages.length === 0 && !input.trim() ? (
                <div className="coach-welcome-card">
                  <strong>{introPrompt}</strong>
                </div>
              ) : null}

              {messages.map((message, index) => (
                <article key={index} className={message.role === "assistant" ? "chat-bubble coach" : "chat-bubble user"}>
                  <strong>{message.role === "assistant" ? "Coach" : "You"}</strong>
                  <div>{message.text}</div>
                </article>
              ))}

              {running ? (
                <article className="chat-bubble coach coach-working" aria-live="polite" aria-label="Coach is working">
                  <strong>Coach</strong>
                  <div className="coach-working-row">
                    <span>Working on your response</span>
                    <span className="coach-working-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </article>
              ) : null}

              <div ref={chatEndRef} className="chat-scroll-anchor" aria-hidden="true" />
            </div>

            <form className="member-chat-form" onSubmit={send}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
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
      ) : tab === "workouts" ? (
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
                      const workout = asRecord(currentWorkouts[id]);
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
                      const workout = asRecord(upcomingWorkouts[id]);
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
                {workoutList.map(({ key, id, workout, scope }) => {
                  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
                  const names = exercises.map(exerciseLabel).filter(Boolean);
                  return (
                    <article key={key} className="workout-card">
                      <div className="workout-card-topline">
                        <span>{scope === "next" ? "Next saved week" : "Current saved week"}</span>
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
                          setInput(`I want to adjust my "${workoutTitle(workout, id)}" workout in my ${scope === "next" ? "next" : "current"} saved week.`);
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
      ) : (
        <section className="member-workouts-panel">
          <div className="member-panel-heading">
            <div>
              <p className="eyebrow compact-eyebrow">PREVIOUS CHATS</p>
              <h2>{selectedThread ? "Previous conversation" : "Your chat history"}</h2>
              <p>
                {selectedThread
                  ? "Review this conversation exactly as it was stored."
                  : "Open an earlier Fitness Coach conversation without losing your current saved workouts."}
              </p>
            </div>
            {selectedThread ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedThreadId("")}
              >
                Back to chats
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadChatHistory()}
                disabled={historyLoading}
              >
                {historyLoading ? "Loading..." : "Refresh chats"}
              </button>
            )}
          </div>

          {historyError ? <div className="workout-empty member-error">{historyError}</div> : null}
          {historyLoading && !selectedThread ? (
            <div className="workout-empty">Loading your previous chats...</div>
          ) : null}

          {!historyLoading && !historyError && !selectedThread && threads.length === 0 ? (
            <div className="workout-empty">
              <strong>No previous chats were found.</strong>
              <p>New Fitness Coach conversations will appear here after they are stored by Pickaxe.</p>
            </div>
          ) : null}

          {!selectedThread && threads.length ? (
            <div className="workout-card-grid">
              {threads.map((thread) => (
                <article key={thread.id} className="workout-card">
                  <div className="workout-card-topline">
                    <span>{formatHistoryDate(thread.updatedAt || thread.createdAt) || "Previous chat"}</span>
                    <strong>{thread.messages.length} messages</strong>
                  </div>
                  <h3>{thread.title}</h3>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => reviewThread(thread)}
                  >
                    Review chat
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {selectedThread ? (
            <>
              <div className="member-chat-messages">
                {selectedThread.messages.map((message, index) => (
                  <article
                    key={index}
                    className={message.role === "assistant" ? "chat-bubble coach" : "chat-bubble user"}
                  >
                    <strong>{message.role === "assistant" ? "Coach" : "You"}</strong>
                    <div>{cleanCoachText(message.text)}</div>
                  </article>
                ))}
              </div>
              <div className="member-hub-actions">
                {canResumeThread(selectedThread.id) ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => resumeThread(selectedThread)}
                  >
                    Continue this chat
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={newChat}>
                    Start a new chat
                  </button>
                )}
              </div>
            </>
          ) : null}
        </section>
      )}
    </main>
  );
}
