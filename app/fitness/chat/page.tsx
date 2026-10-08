"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import WorkoutHistoryList from "@/components/WorkoutHistoryList";
import { withSingleNetworkRetry, withTransientAuthRetry } from "@/lib/clientFetchRetry";

type Message = { role: "user" | "assistant"; text: string };
type JsonRecord = Record<string, unknown>;

type ChatResult = {
  ok?: boolean;
  response?: string;
  error?: string;
  conversationId?: string;
  relaySource?: string;
  actionMode?: string | null;
  savedPlanVerified?: boolean;
  plan?: JsonRecord | null;
  pendingPlanRequest?: string;
};

type PlanResult = {
  ok?: boolean;
  plan?: JsonRecord | null;
  historyEntries?: unknown[];
  error?: string;
};

type CompletionResult = {
  ok?: boolean;
  completedAt?: string;
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
    .replace(/\\([*_#])/g, "$1")
    .replace(/\\(?=#{1,6}\s)/g, "")
    .replace(/^#{1,6}\s+/gm, "")
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

type TrackerSet = {
  weight: string;
  reps: string;
  time: string;
  distance: string;
};

type TrackerFields = {
  weight: boolean;
  reps: boolean;
  time: boolean;
  distance: boolean;
};

type TrackerExercise = {
  id: string;
  name: string;
  trackingType: string | null;
  skipped: boolean;
  prescription: string;
  fields: TrackerFields;
  sets: TrackerSet[];
};

type WorkoutTracker = {
  completionMode?: "flexible";
  completionId?: string;
  key: string;
  workoutId: string;
  scheduledDate: string;
  day: string;
  scope: WorkoutScope;
  workout: JsonRecord;
};

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

function dateKeyForPlan(plan: JsonRecord | null) {
  const timeZone =
    typeof plan?.userTimezone === "string" && plan.userTimezone.trim()
      ? plan.userTimezone.trim()
      : undefined;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : "";
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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
  if (typeof value === "string") return value.trim();
  const exercise = asRecord(value);
  if (!exercise) return "";
  return String(exercise.name || exercise.title || exercise.exercise || "").trim();
}

function timeLikeValue(value: unknown) {
  return (
    typeof value === "string" &&
    /(?:^|\s)\d+(?:\.\d+)?\s*(?:s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)(?:\s|$)/i.test(
      value.trim(),
    )
  );
}

function exerciseDetail(value: unknown) {
  const exercise = asRecord(value);
  if (!exercise) return "";
  const parts: string[] = [];

  if (typeof exercise.sets === "number") parts.push(`${exercise.sets} sets`);
  if (typeof exercise.reps === "number" || typeof exercise.reps === "string") {
    parts.push(timeLikeValue(exercise.reps) ? String(exercise.reps).trim() : `${exercise.reps} reps`);
  }
  if (typeof exercise.time === "string" && exercise.time.trim()) parts.push(exercise.time.trim());
  if (typeof exercise.duration === "string" && exercise.duration.trim()) {
    parts.push(exercise.duration.trim());
  }
  if (typeof exercise.durationMinutes === "number") {
    parts.push(`${exercise.durationMinutes} min`);
  }
  if (
    (typeof exercise.distance === "string" && exercise.distance.trim()) ||
    typeof exercise.distance === "number"
  ) {
    parts.push(String(exercise.distance).trim());
  }

  return parts.join(" · ");
}

function trackerFieldVisibility(exercise: JsonRecord | null): TrackerFields {
  if (!exercise) {
    return { weight: true, reps: true, time: false, distance: false };
  }

  const trackingType = String(exercise.trackingType || "").toLowerCase();
  const exerciseName = String(exercise.name || exercise.title || exercise.exercise || "").toLowerCase();
  const repsValue = exercise.reps;

  const hasExplicitDistance =
    (typeof exercise.distance === "string" && !!exercise.distance.trim()) ||
    typeof exercise.distance === "number";
  const hasExplicitTime =
    (typeof exercise.time === "string" && !!exercise.time.trim()) ||
    (typeof exercise.duration === "string" && !!exercise.duration.trim()) ||
    typeof exercise.durationMinutes === "number" ||
    typeof exercise.durationSeconds === "number";
  const timedRepPrescription = timeLikeValue(repsValue);

  const distanceRelevant =
    hasExplicitDistance ||
    /distance|meter|metre|mile|kilometer|kilometre|\bkm\b/.test(trackingType) ||
    /distance|meter|metre|mile|kilometer|kilometre|\bkm\b/.test(exerciseName);

  const timeRelevant =
    hasExplicitTime ||
    timedRepPrescription ||
    /time|duration|interval|hold/.test(trackingType);

  const repsRelevant =
    !timedRepPrescription &&
    (typeof repsValue === "number" ||
      (typeof repsValue === "string" && !!repsValue.trim()) ||
      /rep|set|strength|resistance|weight|load|bodyweight/.test(trackingType));

  const weightRelevant =
    repsRelevant ||
    /weight|load|strength|resistance/.test(trackingType) ||
    exercise.weight != null ||
    exercise.load != null;

  if (distanceRelevant) {
    return {
      weight: false,
      reps: repsRelevant && !timeRelevant,
      time: timeRelevant || !repsRelevant,
      distance: true,
    };
  }

  if (timeRelevant && !repsRelevant) {
    return { weight: false, reps: false, time: true, distance: false };
  }

  if (repsRelevant) {
    return { weight: weightRelevant, reps: true, time: false, distance: false };
  }

  return { weight: true, reps: true, time: false, distance: false };
}

function prescribedSetCount(exercise: JsonRecord | null) {
  const sets = exercise?.sets;
  if (typeof sets === "number" && Number.isFinite(sets)) {
    return Math.min(20, Math.max(1, Math.round(sets)));
  }
  if (Array.isArray(sets) && sets.length) return Math.min(20, sets.length);
  return 1;
}

function emptyTrackerSet(): TrackerSet {
  return { weight: "", reps: "", time: "", distance: "" };
}

function buildTrackerExercises(workout: JsonRecord): TrackerExercise[] {
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];

  return exercises.flatMap((value, index) => {
    const exercise = asRecord(value);
    const name = exerciseLabel(value) || `Exercise ${index + 1}`;
    if (!name) return [];

    const count = prescribedSetCount(exercise);
    return [{
      id: String(exercise?.id || `exercise-${index + 1}`),
      name,
      trackingType:
        typeof exercise?.trackingType === "string" ? exercise.trackingType : null,
      skipped: false,
      prescription: exerciseDetail(value),
      fields: trackerFieldVisibility(exercise),
      sets: Array.from({ length: count }, () => emptyTrackerSet()),
    }];
  });
}

function completionKey(workoutId: string, scheduledDate: string) {
  return `${workoutId}::${scheduledDate}`;
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
  const [pendingPlanRequest, setPendingPlanRequest] = useState("");
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
  const [expandedWorkoutKey, setExpandedWorkoutKey] = useState<string | null>(null);
  const [completionBusyKey, setCompletionBusyKey] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [activeWorkoutTracker, setActiveWorkoutTracker] = useState<WorkoutTracker | null>(null);
  const [trackerExercises, setTrackerExercises] = useState<TrackerExercise[]>([]);
  const [trackerNotes, setTrackerNotes] = useState("");
  const [trackerDuration, setTrackerDuration] = useState("");
  const [completionNotice, setCompletionNotice] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const planRequestVersion = useRef(0);

  async function loadPlan(background = false) {
    const requestVersion = ++planRequestVersion.current;
    if (!background) setPlanLoading(true);
    setPlanError("");
    try {
      const response = await withTransientAuthRetry(() => fetch("/api/fitness/chat", { method: "GET", cache: "no-store" }));
      const data = (await response.json()) as PlanResult;
      // An older GET must never overwrite a just-verified save or a newer GET.
      if (requestVersion !== planRequestVersion.current) return;
      if (!response.ok || !data.ok) {
        setPlanError(data.error || "Saved workouts could not be loaded.");
        return;
      }
      setPlan(data.plan || null);
      setHistory(Array.isArray(data.historyEntries) ? data.historyEntries : []);
    } catch {
      if (requestVersion === planRequestVersion.current) setPlanError("Saved workouts could not be loaded.");
    } finally {
      if (requestVersion === planRequestVersion.current) setPlanLoading(false);
    }
  }

  async function loadChatHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await withTransientAuthRetry(() =>
        fetch("/api/fitness/chat/history", {
          method: "GET",
          cache: "no-store",
        }),
      );
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

  async function completeScheduledWorkout(
    workoutId: string,
    scheduledDate: string,
    mode: "complete" | "sync" = "complete",
  ) {
    const key = completionKey(workoutId, scheduledDate);
    if (!workoutId || !scheduledDate || completionBusyKey) return;

    setCompletionBusyKey(key);
    setCompletionError("");

    try {
      const requestBody = JSON.stringify({
        action: mode === "sync" ? "sync_completed_workout" : "complete_workout",
        workoutId,
        scheduledDate,
      });
      const response = await withSingleNetworkRetry(() =>
        fetch("/api/fitness/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      const data = (await response.json()) as CompletionResult;
      if (!response.ok || !data.ok) {
        setCompletionError(
          data.error ||
            (mode === "sync"
              ? "Workout could not be synced with Coach."
              : "Workout completion could not be saved."),
        );
        return;
      }

      await loadPlan();
    } catch {
      setCompletionError(
        mode === "sync"
          ? "Workout could not be synced with Coach."
          : "Workout completion could not be saved.",
      );
    } finally {
      setCompletionBusyKey("");
    }
  }


  function openWorkoutTracker(
    scope: WorkoutScope,
    row: JsonRecord,
    workout: JsonRecord | null,
  ) {
    if (completionBusyKey) return;
    const workoutId = String(row.workoutId || "");
    const flexible = scope === "current" && plan?.scheduleMode === "flexible_sequence";
    const scheduledDate = flexible ? dateKeyForPlan(plan) : String(row.date || "");
    if (!workout || !workoutId || !scheduledDate) return;

    setActiveWorkoutTracker({
      ...(flexible ? { completionMode: "flexible" as const, completionId: crypto.randomUUID() } : {}),
      key: `${scope}:${workoutId}:${scheduledDate}`,
      workoutId,
      scheduledDate,
      day: String(row.day || "Workout"),
      scope,
      workout,
    });
    setTrackerExercises(buildTrackerExercises(workout));
    setTrackerNotes("");
    setTrackerDuration("");
    setCompletionError("");
    setCompletionNotice("");
  }

  function updateTrackerSet(
    exerciseIndex: number,
    setIndex: number,
    field: keyof TrackerSet,
    value: string,
  ) {
    setTrackerExercises((items) =>
      items.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex !== exerciseIndex
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, currentSetIndex) =>
                currentSetIndex === setIndex ? { ...set, [field]: value } : set,
              ),
            },
      ),
    );
  }

  function toggleTrackerExercise(exerciseIndex: number) {
    setTrackerExercises((items) =>
      items.map((exercise, currentIndex) =>
        currentIndex === exerciseIndex
          ? { ...exercise, skipped: !exercise.skipped }
          : exercise,
      ),
    );
  }

  function addTrackerSet(exerciseIndex: number) {
    setTrackerExercises((items) =>
      items.map((exercise, currentIndex) =>
        currentIndex === exerciseIndex && exercise.sets.length < 20
          ? { ...exercise, sets: [...exercise.sets, emptyTrackerSet()] }
          : exercise,
      ),
    );
  }

  function removeTrackerSet(exerciseIndex: number, setIndex: number) {
    setTrackerExercises((items) =>
      items.map((exercise, currentIndex) =>
        currentIndex === exerciseIndex && exercise.sets.length > 1
          ? {
              ...exercise,
              sets: exercise.sets.filter((_, currentSetIndex) => currentSetIndex !== setIndex),
            }
          : exercise,
      ),
    );
  }

  async function completeTrackedWorkout() {
    if (!activeWorkoutTracker || completionBusyKey) return;
    const key = completionKey(
      activeWorkoutTracker.workoutId,
      activeWorkoutTracker.scheduledDate,
    );

    setCompletionBusyKey(key);
    setCompletionError("");

    try {
      const requestBody = JSON.stringify({
        action: "complete_workout",
        workoutId: activeWorkoutTracker.workoutId,
        scheduledDate: activeWorkoutTracker.scheduledDate,
        exercises: trackerExercises,
        notes: trackerNotes,
        completionMode: activeWorkoutTracker.completionMode,
        completionId: activeWorkoutTracker.completionId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        actualDurationMinutes: trackerDuration.trim() ? Number(trackerDuration) : null,
      });
      const response = await withSingleNetworkRetry(() =>
        fetch("/api/fitness/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      const data = (await response.json()) as CompletionResult;
      if (!response.ok || !data.ok) {
        setCompletionError(data.error || "Workout completion could not be saved.");
        return;
      }

      await loadPlan();
      setActiveWorkoutTracker(null);
      setTrackerExercises([]);
      setTrackerNotes("");
      setTrackerDuration("");
      setCompletionNotice("Workout saved. View its recorded details in Workout history below.");
    } catch {
      setCompletionError("Workout completion could not be saved.");
    } finally {
      setCompletionBusyKey("");
    }
  }

  useEffect(() => {
    void loadPlan();
    void loadChatHistory();

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
    if (tab === "workouts") void loadPlan(true);
  }, [tab]);

  useEffect(() => {
    const refreshVisiblePlan = () => {
      if (document.visibilityState === "visible") void loadPlan(true);
    };
    window.addEventListener("focus", refreshVisiblePlan);
    document.addEventListener("visibilitychange", refreshVisiblePlan);
    return () => {
      window.removeEventListener("focus", refreshVisiblePlan);
      document.removeEventListener("visibilitychange", refreshVisiblePlan);
    };
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
        body: JSON.stringify({ message, conversationId, pendingPlanRequest }),
      });

      const data = (await response.json()) as ChatResult;
      if (data.conversationId) setConversationId(data.conversationId);
      if (typeof data.pendingPlanRequest === "string") setPendingPlanRequest(data.pendingPlanRequest);

      if (!response.ok || !data.ok || !data.response) {
        setStatus(data.error || "The Fitness Coach request did not complete.");
        return;
      }

      setMessages((items) => [...items, { role: "assistant", text: cleanCoachText(data.response!) }]);
      const savedPlanChanged = data.savedPlanVerified === true;
      setStatus(savedPlanChanged ? "Saved and verified in My Workouts." : "");
      if (savedPlanChanged && data.plan) {
        ++planRequestVersion.current;
        setPlan(data.plan);
        setPlanLoading(false);
        setPlanError("");
      } else if (savedPlanChanged) {
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
    setPendingPlanRequest("");
    setTab("coach");
  }

  function reviewThread(thread: HistoryThread) {
    setSelectedThreadId(thread.id);
  }

  function openThreadFromRail(thread: HistoryThread) {
    if (canResumeThread(thread.id)) {
      resumeThread(thread);
      return;
    }

    setSelectedThreadId(thread.id);
    setTab("history");
  }

  function resumeThread(thread: HistoryThread) {
    if (!canResumeThread(thread.id)) return;
    setConversationId(thread.id);
    setMessages(thread.messages);
    setPendingPlanRequest("");
    setStatus("");
    setSelectedThreadId("");
    setPendingPlanRequest("");
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
  const completedScheduleKeys = useMemo(
    () =>
      new Set(
        history.flatMap((entry) => {
          const record = asRecord(entry);
          const workoutId = String(record?.workoutId || "");
          const scheduledDate = String(record?.scheduledDate || "");
          return record?.completedAt && workoutId && scheduledDate
            ? [completionKey(workoutId, scheduledDate)]
            : [];
        }),
      ),
    [history],
  );
  const scheduleMode =
    plan?.scheduleMode === "fixed_weekdays"
      ? "Scheduled by day"
      : plan?.scheduleMode === "flexible_sequence"
        ? "Flexible plan"
        : "Saved plan";
  const todayKey = dateKeyForPlan(plan);

  useEffect(() => {
    if (activeWorkoutTracker) {
      const panel = document.getElementById("active-workout-tracker");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeWorkoutTracker?.key]);

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
          <Link href="/manage-subscription" className="member-billing-link">Manage Subscription</Link>
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
      </nav>

      {tab === "coach" ? (
        <section className="member-coach-layout">
          <aside className="chat-history-rail" aria-label="Previous chats">
            <div className="chat-history-rail-heading">
              <div>
                <p className="eyebrow compact-eyebrow">CHATS</p>
                <h2>Previous Chats</h2>
              </div>
              <button type="button" className="text-button" onClick={newChat}>
                + New
              </button>
            </div>

            {historyLoading ? <p className="chat-history-state">Loading chats...</p> : null}
            {historyError ? <p className="chat-history-state member-error">{historyError}</p> : null}

            {!historyLoading && !historyError && threads.length === 0 ? (
              <p className="chat-history-state">Your previous Fitness Coach chats will appear here.</p>
            ) : null}

            {threads.length ? (
              <div className="chat-history-list">
                {threads.slice(0, 20).map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={
                      canResumeThread(thread.id) && thread.id === conversationId
                        ? "chat-history-item active"
                        : "chat-history-item"
                    }
                    onClick={() => openThreadFromRail(thread)}
                    title={thread.title}
                  >
                    <strong>{thread.title}</strong>
                    <span>{formatHistoryDate(thread.updatedAt || thread.createdAt) || "Previous chat"}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              className="secondary-button chat-history-view-all"
              onClick={() => {
                setSelectedThreadId("");
                setTab("history");
                void loadChatHistory();
              }}
            >
              View all chats
            </button>
          </aside>

          <div className="member-chat-panel">
            <div className="member-panel-heading">
              <div>
                <p className="eyebrow compact-eyebrow">YOUR COACH</p>
                <h2>What are we working on today?</h2>
              </div>
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

          {planLoading && !plan ? <div className="workout-empty">Loading your workouts...</div> : null}
          {planError ? <div className="workout-empty member-error">{planError}{plan ? " Showing the last loaded plan." : ""}</div> : null}
          {!planLoading && !planError && !plan ? (
            <div className="workout-empty">
              <strong>No saved workout plan yet.</strong>
              <p>Go to Coach and ask for a plan that fits your goals, schedule, and equipment.</p>
            </div>
          ) : null}

          {plan ? (
            <>
              <div className="workout-summary-strip">
                <div><span>Plan style</span><strong>{scheduleMode}</strong></div>
                <div><span>Workouts</span><strong>{workoutList.length}</strong></div>
                <div><span>Recent completions</span><strong>{completedCount}</strong><a href="#workout-history" className="text-button">View workout history</a></div>
              </div>

              {completionNotice ? <p role="status">{completionNotice}</p> : null}

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
                      const scheduledDate = String(row.date || "");
                      const workout = asRecord(currentWorkouts[id]);
                      const rest = row.isRestDay === true || !id;
                      const workoutKey = `current:${id}`;
                      const doneKey = completionKey(id, scheduledDate);
                      const completed = !!scheduledDate && completedScheduleKeys.has(doneKey);
                      const savingCompletion = completionBusyKey === doneKey;
                      return (
                        <article key={index} className={rest ? "schedule-card rest" : "schedule-card"}>
                          <span>{String(row.day || row.label || `Workout ${index + 1}`)}</span>
                          {row.date ? <small>{formatDate(row.date)}</small> : null}
                          <strong>{rest ? "Rest" : workoutTitle(workout, id)}</strong>
                          {!rest ? (
                            <div className="schedule-card-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  setExpandedWorkoutKey((current) =>
                                    current === workoutKey ? null : workoutKey,
                                  )
                                }
                              >
                                {expandedWorkoutKey === workoutKey ? "Hide details" : "View details"}
                              </button>
                              {workout && (scheduledDate || plan.scheduleMode === "flexible_sequence") ? (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => openWorkoutTracker("current", row, workout)}
                                >
                                  {plan.scheduleMode === "flexible_sequence" ? "Start workout" : "Open workout"}
                                </button>
                              ) : null}
                              {scheduledDate ? (
                                completed ? (
                                  <button type="button" className="text-button" disabled>
                                    Completed
                                  </button>
                                ) : todayKey && scheduledDate < todayKey ? (
                                  <button
                                    type="button"
                                    className="text-button"
                                    disabled={!!completionBusyKey}
                                    onClick={() =>
                                      void completeScheduledWorkout(id, scheduledDate, "sync")
                                    }
                                  >
                                    {savingCompletion ? "Syncing..." : "Sync with Coach"}
                                  </button>
                                ) : !todayKey || scheduledDate === todayKey ? (
                                  <button
                                    type="button"
                                    className="text-button"
                                    disabled={!!completionBusyKey}
                                    onClick={() => void completeScheduledWorkout(id, scheduledDate)}
                                  >
                                    {savingCompletion ? "Saving..." : "Mark complete"}
                                  </button>
                                ) : null
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  {completionError ? <p className="member-error completion-error">{completionError}</p> : null}
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
                      const scheduledDate = String(row.date || "");
                      const workout = asRecord(upcomingWorkouts[id]);
                      const rest = row.isRestDay === true || !id;
                      const completed =
                        !!scheduledDate &&
                        completedScheduleKeys.has(completionKey(id, scheduledDate));
                      return (
                        <article key={index} className={rest ? "schedule-card rest" : "schedule-card"}>
                          <span>{String(row.day || row.label || `Workout ${index + 1}`)}</span>
                          {row.date ? <small>{formatDate(row.date)}</small> : null}
                          <strong>{rest ? "Rest" : workoutTitle(workout, id)}</strong>
                          {!rest && scheduledDate && workout ? (
                            <div className="schedule-card-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => openWorkoutTracker("next", row, workout)}
                              >
                                Open workout
                              </button>
                              {completed ? <span className="schedule-completed-label">Completed</span> : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {activeWorkoutTracker ? (
                <section id="active-workout-tracker" tabIndex={-1} className="workout-tracker-panel" aria-label="Workout tracker">
                  <div className="workout-tracker-heading">
                    <div>
                      <p className="eyebrow compact-eyebrow">
                        {activeWorkoutTracker.completionMode === "flexible" ? "FLEXIBLE WORKOUT" : activeWorkoutTracker.scope === "next" ? "NEXT SAVED WEEK" : "CURRENT SAVED WEEK"}
                      </p>
                      <h3>{workoutTitle(activeWorkoutTracker.workout, activeWorkoutTracker.workoutId)}</h3>
                      <p>
                        {activeWorkoutTracker.day} · {formatDate(activeWorkoutTracker.scheduledDate)}
                        {typeof activeWorkoutTracker.workout.durationMinutes === "number"
                          ? ` · ${activeWorkoutTracker.workout.durationMinutes} min`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setActiveWorkoutTracker(null)}
                    >
                      Close
                    </button>
                  </div>

                  {trackerExercises.length ? (
                    <div className="workout-tracker-exercises">
                      {trackerExercises.map((exercise, exerciseIndex) => (
                        <article
                          key={exercise.id || exerciseIndex}
                          className={exercise.skipped ? "tracker-exercise skipped" : "tracker-exercise"}
                        >
                          <div className="tracker-exercise-heading">
                            <div>
                              <h4>{exercise.name}</h4>
                              {exercise.prescription ? <p>{exercise.prescription}</p> : null}
                            </div>
                            <label className="tracker-skip">
                              <input
                                type="checkbox"
                                checked={exercise.skipped}
                                onChange={() => toggleTrackerExercise(exerciseIndex)}
                              />
                              <span>Skip exercise</span>
                            </label>
                          </div>

                          {!exercise.skipped ? (
                            <>
                              <div className="tracker-set-list">
                                {exercise.sets.map((set, setIndex) => (
                                  <div
                                    key={setIndex}
                                    className={`tracker-set-row tracker-fields-${
                                      Object.values(exercise.fields).filter(Boolean).length
                                    }`}
                                  >
                                    <strong>Set {setIndex + 1}</strong>
                                    {exercise.fields.weight ? (
                                      <input
                                        value={set.weight}
                                        onChange={(event) =>
                                          updateTrackerSet(exerciseIndex, setIndex, "weight", event.target.value)
                                        }
                                        placeholder="Weight"
                                        inputMode="decimal"
                                        aria-label={`${exercise.name} set ${setIndex + 1} weight`}
                                      />
                                    ) : null}
                                    {exercise.fields.reps ? (
                                      <input
                                        value={set.reps}
                                        onChange={(event) =>
                                          updateTrackerSet(exerciseIndex, setIndex, "reps", event.target.value)
                                        }
                                        placeholder="Reps"
                                        inputMode="numeric"
                                        aria-label={`${exercise.name} set ${setIndex + 1} reps`}
                                      />
                                    ) : null}
                                    {exercise.fields.time ? (
                                      <input
                                        value={set.time}
                                        onChange={(event) =>
                                          updateTrackerSet(exerciseIndex, setIndex, "time", event.target.value)
                                        }
                                        placeholder="Time"
                                        aria-label={`${exercise.name} set ${setIndex + 1} time`}
                                      />
                                    ) : null}
                                    {exercise.fields.distance ? (
                                      <input
                                        value={set.distance}
                                        onChange={(event) =>
                                          updateTrackerSet(exerciseIndex, setIndex, "distance", event.target.value)
                                        }
                                        placeholder="Distance"
                                        aria-label={`${exercise.name} set ${setIndex + 1} distance`}
                                      />
                                    ) : null}
                                    {exercise.sets.length > 1 ? (
                                      <button
                                        type="button"
                                        className="tracker-remove-set"
                                        onClick={() => removeTrackerSet(exerciseIndex, setIndex)}
                                        aria-label={`Remove ${exercise.name} set ${setIndex + 1}`}
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                              {exercise.sets.length < 20 ? (
                                <button
                                  type="button"
                                  className="text-button tracker-add-set"
                                  onClick={() => addTrackerSet(exerciseIndex)}
                                >
                                  + Add set
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-copy">
                      This saved workout does not include individual exercises to track.
                    </p>
                  )}

                  {activeWorkoutTracker.completionMode === "flexible" ? (
                    <label className="tracker-notes">
                      <span>Workout date</span>
                      <input type="date" value={activeWorkoutTracker.scheduledDate} max={todayKey}
                        disabled={!!completionBusyKey}
                        onChange={(event) => setActiveWorkoutTracker((current) => current ? { ...current, scheduledDate: event.target.value } : null)} />
                      <small>This records the session date without assigning your flexible plan to weekdays.</small>
                    </label>
                  ) : null}
                  <label className="tracker-notes">
                    <span>Minutes completed (optional)</span>
                    <input type="number" min="1" max="1440" step="0.5" value={trackerDuration}
                      disabled={!!completionBusyKey}
                      onChange={(event) => setTrackerDuration(event.target.value)}
                      placeholder="Enter actual minutes, not the planned duration" />
                  </label>

                  <label className="tracker-notes">
                    <span>Workout notes</span>
                    <textarea
                      value={trackerNotes}
                      onChange={(event) => setTrackerNotes(event.target.value)}
                      rows={3}
                      maxLength={280}
                      placeholder="Optional notes about the workout..."
                    />
                  </label>

                  {completionError ? <p className="member-error">{completionError}</p> : null}

                  <div className="workout-tracker-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        !!completionBusyKey || !activeWorkoutTracker.scheduledDate ||
                        (!!todayKey && activeWorkoutTracker.scheduledDate > todayKey)
                      }
                      onClick={() => void completeTrackedWorkout()}
                    >
                      {todayKey && activeWorkoutTracker.scheduledDate > todayKey
                        ? "Scheduled for later"
                        : completionBusyKey === completionKey(
                            activeWorkoutTracker.workoutId,
                            activeWorkoutTracker.scheduledDate,
                          )
                          ? "Saving..."
                          : "Complete workout and save"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setActiveWorkoutTracker(null)}
                    >
                      Close workout
                    </button>
                  </div>
                </section>
              ) : null}

              <div className="workout-card-grid">
                {workoutList.map(({ key, id, workout, scope }) => {
                  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
                  const expanded = expandedWorkoutKey === key;
                  return (
                    <article key={key} className={expanded ? "workout-card expanded" : "workout-card"}>
                      <div className="workout-card-topline">
                        <span>{scope === "next" ? "Next saved week" : "Current saved week"}</span>
                        {typeof workout.durationMinutes === "number" ? (
                          <strong>{workout.durationMinutes} min</strong>
                        ) : null}
                      </div>
                      <h3>{workoutTitle(workout, id)}</h3>
                      {workout.description ? <p>{String(workout.description)}</p> : null}

                      {expanded ? (
                        exercises.length ? (
                          <div className="workout-detail-list">
                            {exercises.map((exercise, index) => {
                              const name = exerciseLabel(exercise) || `Exercise ${index + 1}`;
                              const detail = exerciseDetail(exercise);
                              return (
                                <div key={index} className="workout-detail-row">
                                  <strong>{name}</strong>
                                  {detail ? <span>{detail}</span> : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="muted-copy">No additional exercise details are saved for this workout.</p>
                        )
                      ) : (
                        <p className="muted-copy">
                          {exercises.length
                            ? `${exercises.length} exercise${exercises.length === 1 ? "" : "s"} saved`
                            : "Open the workout to review its saved details."}
                        </p>
                      )}

                      <div className="workout-card-actions">
                        {scope === "current" && plan.scheduleMode === "flexible_sequence" ? (
                          <button type="button" className="primary-button" disabled={!!completionBusyKey}
                            onClick={() => openWorkoutTracker("current", { workoutId: id, label: workoutTitle(workout, id) }, workout)}>
                            Start workout
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="secondary-button"
                          aria-expanded={expandedWorkoutKey === key}
                          onClick={() =>
                            setExpandedWorkoutKey((current) => (current === key ? null : key))
                          }
                        >
                          {expanded ? "Hide details" : "View details"}
                        </button>
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
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}
          <WorkoutHistoryList entries={history} />
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
