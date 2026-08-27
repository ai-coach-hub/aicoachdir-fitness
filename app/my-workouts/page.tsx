"use client";

import { useEffect, useState } from "react";
import styles from "./my-workouts.module.css";

type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  repsLabel?: string;
  restSeconds?: number;
  cue?: string;
  videoUrl?: string;
};

type Workout = {
  id: string;
  title: string;
  durationMinutes?: number;
  exercises: Exercise[];
};

type ScheduleItem = {
  day: string;
  isRestDay: boolean;
  workoutId: string | null;
};

type WorkoutPlan = {
  weekSchedule: ScheduleItem[];
  workouts: Record<string, Workout>;
};

type SavedSet = {
  exercise_id: string;
  set_number: number;
  actual_reps: number | null;
  weight: number | null;
  completed: boolean;
};

type LocalSet = {
  weight: string;
  reps: string;
  completed: boolean;
};

export default function MyWorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [setValues, setSetValues] = useState<Record<string, LocalSet>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPlan() {
      try {
        const response = await fetch("/api/workout-plan", {
          cache: "no-store",
        });

        if (!response.ok) throw new Error("Unable to load workout plan.");

        const data = await response.json();

        if (!data?.plan) throw new Error("No workout plan is saved.");

        setPlan(data.plan);

        const firstWorkout = data.plan.weekSchedule.findIndex(
          (item: ScheduleItem) =>
            !item.isRestDay &&
            item.workoutId &&
            data.plan.workouts[item.workoutId]
        );

        setSelectedIndex(firstWorkout >= 0 ? firstWorkout : 0);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load workout plan."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPlan();
  }, []);

  const scheduleItem = plan?.weekSchedule[selectedIndex] ?? null;
  const workout =
    scheduleItem?.workoutId && plan
      ? plan.workouts[scheduleItem.workoutId]
      : null;

  useEffect(() => {
    if (!workout) {
      setSessionId(null);
      setSetValues({});
      return;
    }

    async function loadProgress() {
      const empty: Record<string, LocalSet> = {};

      workout!.exercises.forEach((exercise) => {
        for (let n = 1; n <= exercise.sets; n++) {
          empty[`${exercise.id}:${n}`] = {
            weight: "",
            reps: "",
            completed: false,
          };
        }
      });

      try {
        const response = await fetch(
          `/api/workout-tracking?workoutId=${encodeURIComponent(workout!.id)}`,
          { cache: "no-store" }
        );

        if (!response.ok) throw new Error();

        const data = await response.json();

        if (data.session?.status === "in_progress") {
          setSessionId(data.session.id);

          for (const saved of data.sets as SavedSet[]) {
            empty[`${saved.exercise_id}:${saved.set_number}`] = {
              weight:
                saved.weight === null || saved.weight === undefined
                  ? ""
                  : String(saved.weight),
              reps:
                saved.actual_reps === null ||
                saved.actual_reps === undefined
                  ? ""
                  : String(saved.actual_reps),
              completed: saved.completed === true,
            };
          }

          setStatus("Workout in progress");
        } else {
          setSessionId(null);
          setStatus(
            data.session?.status === "completed"
              ? "Previous workout completed"
              : ""
          );
        }

        setSetValues(empty);
      } catch {
        setError("Unable to load workout progress.");
      }
    }

    loadProgress();
  }, [workout?.id]);

  async function startWorkout() {
    if (!workout || !scheduleItem) return;

    setError("");

    const response = await fetch("/api/workout-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: workout.id,
        workoutTitle: workout.title,
        scheduleLabel: scheduleItem.day,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.message || "Unable to start workout.");
      return;
    }

    setSessionId(data.sessionId);
    setStatus(data.resumed ? "Workout resumed" : "Workout started");

    if (!data.resumed) {
      const blank: Record<string, LocalSet> = {};

      workout.exercises.forEach((exercise) => {
        for (let n = 1; n <= exercise.sets; n++) {
          blank[`${exercise.id}:${n}`] = {
            weight: "",
            reps: "",
            completed: false,
          };
        }
      });

      setSetValues(blank);
    }
  }

  async function saveSet(
    exercise: Exercise,
    setNumber: number,
    next: LocalSet
  ) {
    if (!sessionId) return;

    const response = await fetch("/api/workout-tracking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-set",
        sessionId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        setNumber,
        targetReps: exercise.repsLabel || exercise.reps,
        actualReps: next.reps === "" ? null : Number(next.reps),
        weight: next.weight === "" ? null : Number(next.weight),
        weightUnit: "lb",
        completed: next.completed,
      }),
    });

    if (!response.ok) {
      setError("Unable to save that set.");
    }
  }

  function updateSet(
    exercise: Exercise,
    setNumber: number,
    changes: Partial<LocalSet>,
    save = false
  ) {
    const key = `${exercise.id}:${setNumber}`;
    const current = setValues[key] ?? {
      weight: "",
      reps: "",
      completed: false,
    };

    const next = { ...current, ...changes };

    setSetValues((previous) => ({
      ...previous,
      [key]: next,
    }));

    if (save) void saveSet(exercise, setNumber, next);
  }

  async function completeWorkout() {
    if (!sessionId) return;

    const response = await fetch("/api/workout-tracking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete-workout",
        sessionId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.message || "Unable to complete workout.");
      return;
    }

    setSessionId(null);
    setStatus("Workout completed ✓");
  }

  if (loading) {
    return <main className={styles.page}>Loading your workouts...</main>;
  }

  if (error && !plan) {
    return <main className={styles.page}>{error}</main>;
  }

  if (!plan) return null;

  const totalSets =
    workout?.exercises.reduce((total, exercise) => total + exercise.sets, 0) ??
    0;

  const completedSets = Object.values(setValues).filter(
    (set) => set.completed
  ).length;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.eyebrow}>AI Coach Directory™</div>
        <h1 className={styles.title}>My Workouts</h1>
        <p className={styles.subtitle}>
          Your current coach-built training plan.
        </p>

        <div className={styles.tabs}>
          {plan.weekSchedule.map((item, index) => (
            <button
              key={`${item.day}-${index}`}
              className={`${styles.tab} ${
                selectedIndex === index ? styles.activeTab : ""
              }`}
              onClick={() => {
                setSelectedIndex(index);
                setError("");
              }}
            >
              {item.day}
              {item.isRestDay ? " · Rest" : ""}
            </button>
          ))}
        </div>

        {scheduleItem?.isRestDay || !workout ? (
          <section className={styles.rest}>
            <div className={styles.eyebrow}>{scheduleItem?.day}</div>
            <h2>Recovery Day</h2>
            <p>Follow your coach&apos;s recovery guidance.</p>
          </section>
        ) : (
          <section className={styles.workout}>
            <div className={styles.workoutHeader}>
              <div>
                <div className={styles.eyebrow}>{scheduleItem?.day ?? "Workout"}</div>
                <h2 className={styles.workoutTitle}>{workout.title}</h2>

                {workout.durationMinutes && (
                  <div className={styles.meta}>
                    About {workout.durationMinutes} minutes
                  </div>
                )}

                {status && <p className={styles.status}>{status}</p>}
              </div>

              {!sessionId && (
                <button
                  className={styles.startButton}
                  onClick={startWorkout}
                >
                  Start Workout
                </button>
              )}
            </div>

            {sessionId && (
              <div className={styles.progress}>
                {completedSets} of {totalSets} sets completed
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}

            {workout.exercises.map((exercise) => (
              <div className={styles.exercise} key={exercise.id}>
                <div className={styles.exerciseTop}>
                  <div>
                    <h3 className={styles.exerciseName}>
                      {exercise.name}
                    </h3>

                    <div className={styles.prescription}>
                      {exercise.sets} sets ×{" "}
                      {exercise.repsLabel || exercise.reps}
                      {exercise.restSeconds
                        ? ` · ${exercise.restSeconds}s rest`
                        : ""}
                    </div>
                  </div>

                  {exercise.videoUrl && (
                    <a
                      className={styles.video}
                      href={exercise.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ▶ Demo
                    </a>
                  )}
                </div>

                {exercise.cue && (
                  <p className={styles.cue}>{exercise.cue}</p>
                )}

                <div
                  className={!sessionId ? styles.disabled : undefined}
                >
                  <div className={styles.setHeader}>
                    <span>Set</span>
                    <span>Weight</span>
                    <span>Reps</span>
                    <span>Done</span>
                  </div>

                  {Array.from({ length: exercise.sets }).map(
                    (_, index) => {
                      const setNumber = index + 1;
                      const key = `${exercise.id}:${setNumber}`;
                      const value = setValues[key] ?? {
                        weight: "",
                        reps: "",
                        completed: false,
                      };

                      return (
                        <div className={styles.setRow} key={key}>
                          <strong>{setNumber}</strong>

                          <input
                            className={styles.input}
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="lb"
                            disabled={!sessionId}
                            value={value.weight}
                            onChange={(event) =>
                              updateSet(exercise, setNumber, {
                                weight: event.target.value,
                              })
                            }
                            onBlur={() =>
                              sessionId &&
                              void saveSet(
                                exercise,
                                setNumber,
                                value
                              )
                            }
                          />

                          <input
                            className={styles.input}
                            type="number"
                            min="0"
                            step="1"
                            placeholder={
                              exercise.repsLabel || exercise.reps
                            }
                            disabled={!sessionId}
                            value={value.reps}
                            onChange={(event) =>
                              updateSet(exercise, setNumber, {
                                reps: event.target.value,
                              })
                            }
                            onBlur={() =>
                              sessionId &&
                              void saveSet(
                                exercise,
                                setNumber,
                                value
                              )
                            }
                          />

                          <input
                            className={styles.check}
                            type="checkbox"
                            disabled={!sessionId}
                            checked={value.completed}
                            onChange={(event) =>
                              updateSet(
                                exercise,
                                setNumber,
                                {
                                  completed: event.target.checked,
                                },
                                true
                              )
                            }
                          />
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            ))}

            {sessionId && (
              <button
                className={styles.completeButton}
                onClick={completeWorkout}
              >
                Complete Workout ✓
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
