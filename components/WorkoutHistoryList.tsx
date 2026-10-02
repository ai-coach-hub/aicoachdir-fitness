"use client";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}
function text(value: unknown, length = 500) {
  return typeof value === "string" || typeof value === "number" ? String(value).slice(0, length) : "";
}
export function recordedWorkoutEntries(entries: unknown[]) {
  return entries.flatMap((value) => {
    const entry = record(value);
    return entry && entry.completedAt && !entry.deleted && !entry.isDeleted && !entry.deletedAt ? [entry] : [];
  }).sort((a, b) => (Date.parse(text(b.completedAt)) || 0) - (Date.parse(text(a.completedAt)) || 0));
}
export function recordedWorkoutDate(entry: RecordValue) {
  const dateOnly = text(entry.scheduledDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const date = new Date(`${dateOnly}T12:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateOnly) {
      return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(date);
    }
  }
  const logged = new Date(text(entry.completedAt));
  return Number.isFinite(logged.getTime())
    ? `Logged ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(logged)}`
    : "Recorded date unavailable";
}
function durationLabel(entry: RecordValue) {
  const actual = entry.actualDurationMinutes;
  if (typeof actual === "number" && Number.isFinite(actual) && actual > 0) return `${actual} minutes completed`;
  const saved = entry.durationMinutes;
  return typeof saved === "number" && Number.isFinite(saved) && saved > 0
    ? `${saved} min saved duration (not measured)` : "Duration not recorded";
}
export function recordedSetText(value: unknown, index: number) {
  const set = record(value);
  if (!set) return "";
  const fields = [["weight", "Weight"], ["reps", "Reps"], ["time", "Time"], ["distance", "Distance"]]
    .flatMap(([key, label]) => {
      const detail = text(set[key], 80).trim();
      return detail ? [`${label}: ${detail}`] : [];
    });
  return fields.length ? `Set ${index + 1} - ${fields.join("; ")}` : "";
}

export default function WorkoutHistoryList({ entries }: { entries: unknown[] }) {
  const saved = recordedWorkoutEntries(entries);
  return (
    <section id="workout-history" aria-labelledby="workout-history-heading" style={{ marginTop: 28, scrollMarginTop: 24 }}>
      <div className="member-panel-heading">
        <div>
          <p className="eyebrow compact-eyebrow">WORKOUT HISTORY</p>
          <h2 id="workout-history-heading">Your recorded sessions</h2>
          <p>{saved.length} recent saved {saved.length === 1 ? "session" : "sessions"}. Open a session to see its recorded details.</p>
          <p className="muted-copy">This is the history currently available to the website, not necessarily your full lifetime log.</p>
        </div>
      </div>
      {!saved.length ? <p className="workout-empty">No completed sessions are available in this loaded history.</p> : null}
      <div className="workout-card-grid">
        {saved.map((entry, index) => {
          const exercises = Array.isArray(entry.exercises) ? entry.exercises.flatMap((value) => {
            const item = record(value); return item ? [item] : [];
          }) : [];
          return (
            <details className="workout-card" key={`${text(entry.completionId || entry.workoutId)}:${text(entry.completedAt)}:${index}`}>
              <summary style={{ cursor: "pointer", minHeight: 48 }}>
                <strong>{text(entry.title || entry.name || "Completed workout", 160)}</strong>
                <div>{recordedWorkoutDate(entry)} - {durationLabel(entry)}</div>
                <span className="text-button">View recorded details</span>
              </summary>
              {text(entry.notes) ? <p><strong>Notes: </strong>{text(entry.notes)}</p> : null}
              {exercises.length ? exercises.map((exercise, exerciseIndex) => {
                const sets = Array.isArray(exercise.sets) ? exercise.sets.map(recordedSetText).filter(Boolean) : [];
                return (
                  <div className="workout-detail-row" key={exerciseIndex}>
                    <strong>{text(exercise.name || exercise.title || "Exercise", 160)}{exercise.skipped === true ? " (skipped)" : ""}</strong>
                    {sets.length ? sets.map((set, setIndex) => <p key={setIndex}>{set}</p>) : <span>No set measurements recorded.</span>}
                  </div>
                );
              }) : <p>No exercise-by-exercise measurements were recorded for this session.</p>}
            </details>
          );
        })}
      </div>
    </section>
  );
}
