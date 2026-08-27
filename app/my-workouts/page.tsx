"use client";

import { useEffect, useState } from "react";

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

type ScheduleDay = {
  day: string;
  isRestDay: boolean;
  workoutId: string | null;
};

type WorkoutPlan = {
  schemaVersion?: number;
  weekSchedule: ScheduleDay[];
  workouts: Record<string, Workout>;
};

export default function MyWorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPlan() {
      try {
        const response = await fetch("/api/workout-plan", {
          cache: "no-store",
        });

        if (response.status === 401) {
          setError("Please sign in to view your workouts.");
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load workout plan.");
        }

        const data = await response.json();

        if (!data?.plan) {
          throw new Error("No workout plan is currently saved.");
        }

        setPlan(data.plan);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load workout plan."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPlan();
  }, []);

  if (loading) {
    return (
      <main className="page">
        <h1>My Workouts</h1>
        <p>Loading your plan...</p>

        <Styles />
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <h1>My Workouts</h1>
        <div className="message">
          <p>{error}</p>
          <a href="/sign-in">Sign in</a>
        </div>

        <Styles />
      </main>
    );
  }

  if (!plan) return null;

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">AI Coach Directory™</p>
        <h1>My Workouts</h1>
        <p className="subtitle">
          Your current coach-built training plan.
        </p>
      </header>

      <section className="schedule">
        {plan.weekSchedule.map((scheduleItem, index) => {
          if (scheduleItem.isRestDay || !scheduleItem.workoutId) {
            return (
              <article
                className="workoutCard restCard"
                key={`${scheduleItem.day}-${index}`}
              >
                <div className="day">{scheduleItem.day}</div>
                <h2>Recovery Day</h2>
                <p>Follow your coach&apos;s recovery guidance.</p>
              </article>
            );
          }

          const workout = plan.workouts[scheduleItem.workoutId];

          if (!workout) return null;

          return (
            <article
              className="workoutCard"
              key={`${scheduleItem.day}-${workout.id}`}
            >
              <div className="workoutHeading">
                <div>
                  <div className="day">{scheduleItem.day}</div>
                  <h2>{workout.title}</h2>
                </div>

                {workout.durationMinutes && (
                  <div className="duration">
                    ~{workout.durationMinutes} min
                  </div>
                )}
              </div>

              <div className="exerciseList">
                {workout.exercises.map((exercise, exerciseIndex) => (
                  <div className="exercise" key={exercise.id}>
                    <div className="exerciseNumber">
                      {exerciseIndex + 1}
                    </div>

                    <div className="exerciseBody">
                      <div className="exerciseTop">
                        <h3>{exercise.name}</h3>

                        {exercise.videoUrl && (
                          <a
                            className="videoButton"
                            href={exercise.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch demo
                          </a>
                        )}
                      </div>

                      <div className="prescription">
                        <strong>{exercise.sets} sets</strong>
                        <span>×</span>
                        <strong>
                          {exercise.repsLabel || exercise.reps}
                        </strong>

                        {exercise.restSeconds && (
                          <>
                            <span>•</span>
                            <span>
                              {exercise.restSeconds}s rest
                            </span>
                          </>
                        )}
                      </div>

                      {exercise.cue && (
                        <p className="cue">{exercise.cue}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <Styles />
    </main>
  );
}

function Styles() {
  return (
    <style jsx>{`
      .page {
        max-width: 900px;
        margin: 0 auto;
        padding: 40px 20px 80px;
        font-family: Arial, sans-serif;
      }

      .header {
        margin-bottom: 32px;
      }

      .eyebrow {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.65;
      }

      h1 {
        margin: 0;
        font-size: 38px;
      }

      .subtitle {
        margin-top: 8px;
        font-size: 17px;
        opacity: 0.7;
      }

      .schedule {
        display: grid;
        gap: 24px;
      }

      .workoutCard {
        border: 1px solid #ddd;
        border-radius: 18px;
        padding: 24px;
        background: white;
      }

      .restCard {
        background: #f7f7f7;
      }

      .workoutHeading {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
        margin-bottom: 20px;
      }

      .day {
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        opacity: 0.55;
        margin-bottom: 4px;
      }

      h2 {
        margin: 0;
        font-size: 23px;
      }

      .duration {
        white-space: nowrap;
        font-size: 14px;
        font-weight: 600;
        opacity: 0.65;
      }

      .exerciseList {
        display: grid;
        gap: 14px;
      }

      .exercise {
        display: flex;
        gap: 14px;
        padding: 16px 0;
        border-top: 1px solid #eee;
      }

      .exerciseNumber {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #111;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-weight: 700;
        font-size: 13px;
      }

      .exerciseBody {
        width: 100%;
      }

      .exerciseTop {
        display: flex;
        justify-content: space-between;
        gap: 15px;
        align-items: center;
      }

      h3 {
        margin: 0;
        font-size: 18px;
      }

      .prescription {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 7px;
        font-size: 15px;
      }

      .cue {
        margin: 9px 0 0;
        line-height: 1.5;
        opacity: 0.72;
      }

      .videoButton {
        padding: 7px 10px;
        border: 1px solid #ccc;
        border-radius: 8px;
        text-decoration: none;
        color: inherit;
        font-size: 13px;
        white-space: nowrap;
      }

      .message {
        margin-top: 25px;
      }

      @media (max-width: 600px) {
        .page {
          padding: 28px 14px 60px;
        }

        h1 {
          font-size: 32px;
        }

        .workoutCard {
          padding: 18px;
        }

        .workoutHeading,
        .exerciseTop {
          align-items: flex-start;
        }
      }
    `}</style>
  );
}
