from pathlib import Path
import hashlib, subprocess


def change(text, old, new, count=1):
    if text.count(old) != count:
        raise RuntimeError('Unexpected source: ' + old[:120])
    return text.replace(old, new)

p = Path('app/fitness/chat/page.tsx')
r = Path('app/api/fitness/chat/route.ts')
for path, expected in [(p, 'cf413f1f47077693e68b81aaf9af9459303e5de6'), (r, 'd38a2e8be6dc682aed32522d0ed0199309f576b3')]:
    raw = path.read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if actual != expected:
        raise RuntimeError('Source changed; refusing to overwrite ' + str(path))
page = p.read_text()
route = r.read_text()
page = change(page, 'import { useClerk } from "@clerk/nextjs";', 'import { useClerk } from "@clerk/nextjs";\nimport WorkoutHistoryList from "@/components/WorkoutHistoryList";')
page = change(page, 'type WorkoutTracker = {\n  key: string;', 'type WorkoutTracker = {\n  completionMode?: "flexible";\n  completionId?: string;\n  key: string;')
page = change(page, '  const [trackerNotes, setTrackerNotes] = useState("");', '  const [trackerNotes, setTrackerNotes] = useState("");\n  const [trackerDuration, setTrackerDuration] = useState("");\n  const [completionNotice, setCompletionNotice] = useState("");')
page = change(page, '''    const workoutId = String(row.workoutId || "");
    const scheduledDate = String(row.date || "");
    if (!workout || !workoutId || !scheduledDate) return;

    setActiveWorkoutTracker({''', '''    if (completionBusyKey) return;
    const workoutId = String(row.workoutId || "");
    const flexible = scope === "current" && plan?.scheduleMode === "flexible_sequence";
    const scheduledDate = flexible ? dateKeyForPlan(plan) : String(row.date || "");
    if (!workout || !workoutId || !scheduledDate) return;

    setActiveWorkoutTracker({
      ...(flexible ? { completionMode: "flexible" as const, completionId: crypto.randomUUID() } : {}),''')
page = change(page, '    setTrackerExercises(buildTrackerExercises(workout));\n    setTrackerNotes("");\n    setCompletionError("");', '    setTrackerExercises(buildTrackerExercises(workout));\n    setTrackerNotes("");\n    setTrackerDuration("");\n    setCompletionError("");\n    setCompletionNotice("");')
page = change(page, '          notes: trackerNotes,', '''          notes: trackerNotes,
          completionMode: activeWorkoutTracker.completionMode,
          completionId: activeWorkoutTracker.completionId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          actualDurationMinutes: trackerDuration.trim() ? Number(trackerDuration) : null,''')
page = change(page, '      setTrackerExercises([]);\n      setTrackerNotes("");', '      setTrackerExercises([]);\n      setTrackerNotes("");\n      setTrackerDuration("");\n      setCompletionNotice("Workout saved. View its recorded details in Workout history below.");')
page = change(page, '  const todayKey = useMemo(() => dateKeyForPlan(plan), [plan]);', '''  const todayKey = dateKeyForPlan(plan);

  useEffect(() => {
    if (activeWorkoutTracker) {
      const panel = document.getElementById("active-workout-tracker");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeWorkoutTracker?.key]);''')
page = change(page, '<div><span>Recent completions</span><strong>{completedCount}</strong></div>', '<div><span>Recent completions</span><strong>{completedCount}</strong><a href="#workout-history" className="text-button">View workout history</a></div>')
page = change(page, '              {rows.length ? (', '              {completionNotice ? <p role="status">{completionNotice}</p> : null}\n\n              {rows.length ? (')
page = change(page, '                          <span>{String(row.day || `Workout ${index + 1}`)}</span>', '                          <span>{String(row.day || row.label || `Workout ${index + 1}`)}</span>', 2)
page = change(page, '{scheduledDate && workout ? (', '{workout && (scheduledDate || plan.scheduleMode === "flexible_sequence") ? (')
page = change(page, '                                  Open workout\n                                </button>', '                                  {plan.scheduleMode === "flexible_sequence" ? "Start workout" : "Open workout"}\n                                </button>')
page = change(page, '<section className="workout-tracker-panel" aria-label="Workout tracker">', '<section id="active-workout-tracker" tabIndex={-1} className="workout-tracker-panel" aria-label="Workout tracker">')
page = change(page, '{activeWorkoutTracker.scope === "next" ? "NEXT SAVED WEEK" : "CURRENT SAVED WEEK"}', '{activeWorkoutTracker.completionMode === "flexible" ? "FLEXIBLE WORKOUT" : activeWorkoutTracker.scope === "next" ? "NEXT SAVED WEEK" : "CURRENT SAVED WEEK"}')
page = change(page, '                  <label className="tracker-notes">', '''                  {activeWorkoutTracker.completionMode === "flexible" ? (
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

                  <label className="tracker-notes">''')
page = change(page, '                        !!completionBusyKey ||\n                        (!!todayKey', '                        !!completionBusyKey || !activeWorkoutTracker.scheduledDate ||\n                        (!!todayKey')
page = change(page, '                          : "Complete workout"', '                          : "Complete workout and save"')
page = change(page, '                      <div className="workout-card-actions">', '''                      <div className="workout-card-actions">
                        {scope === "current" && plan.scheduleMode === "flexible_sequence" ? (
                          <button type="button" className="primary-button" disabled={!!completionBusyKey}
                            onClick={() => openWorkoutTracker("current", { workoutId: id, label: workoutTitle(workout, id) }, workout)}>
                            Start workout
                          </button>
                        ) : null}''')
page = change(page, '            </>\n          ) : null}\n        </section>\n      ) : (', '            </>\n          ) : null}\n          <WorkoutHistoryList entries={history} />\n        </section>\n      ) : (')
p.write_text(page)

route = change(route, 'options: { includeHistory?: boolean; signal?: AbortSignal } = {},', 'options: { includeHistory?: boolean; requireHistory?: boolean; signal?: AbortSignal } = {},')
route = change(route, '  let historyEntries: unknown[] = [];', '  let historyEntries: unknown[] = [];\n  if (options.requireHistory && !historyMemoryId) throw new Error("history-memory-not-configured");')
start = route.index('  if (historyMemoryId && options.includeHistory !== false) {', route.index('async function readMemberWorkoutData'))
end = route.index('\n  return { plan, historyEntries };', start)
route = route[:start] + '''  if (historyMemoryId && options.includeHistory !== false) {
    const historyResponse = await fetch(
      `${PICKAXE_STUDIO_BASE_URL}/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(historyMemoryId)}&skip=0&take=100`,
      { headers, cache: "no-store", signal: readSignal() },
    );
    if (historyResponse.ok) {
      const payload: unknown = await historyResponse.json();
      const snapshot = newestCompletionSnapshot(payload);
      if (snapshot === null && options.requireHistory) throw new Error("history-invalid-response");
      historyEntries = snapshot || [];
    } else if (historyResponse.status !== 404 && options.requireHistory) {
      throw new Error("history-read-failed");
    }
  }
''' + route[end:]
route = change(route, '  entries: Record<string, unknown>[],\n) {', '  entries: Record<string, unknown>[],\n  expectedEntries?: unknown[],\n) {')
route = change(route, '''  const hasExisting =
    existingResponse.ok && collectMemoryValues(await existingResponse.json()).length > 0;

  const updatedAt''', '''  if (!existingResponse.ok && existingResponse.status !== 404) return false;
  const existingPayload: unknown = existingResponse.ok ? await existingResponse.json() : [];
  const existingEntries = newestCompletionSnapshot(existingPayload);
  if (existingEntries === null) return false;
  // Refuse a stale overwrite rather than erase another recently logged session.
  if (expectedEntries && !isDeepStrictEqual(existingEntries, expectedEntries)) return false;
  const hasExisting = collectMemoryValues(existingPayload).length > 0;

  const updatedAt''')
start = route.index('  if (action === "complete_workout" || action === "sync_completed_workout") {')
end = route.index('\n  const deploymentKey = getDeploymentKey();', start)
block = route[start:end]
block = change(block, '    const isRecoverySync = action === "sync_completed_workout";', '''    const isRecoverySync = action === "sync_completed_workout";
    const completionInput = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const isFlexibleCompletion = completionInput.completionMode === "flexible";
    const completionId = typeof completionInput.completionId === "string" ? completionInput.completionId : "";
    if (isFlexibleCompletion && (isRecoverySync || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(completionId))) {
      return Response.json({ ok: false, error: "A valid workout session is required." }, { status: 400 });
    }
    const actualMinutes = completionInput.actualDurationMinutes;
    if (actualMinutes != null && (typeof actualMinutes !== "number" || !Number.isFinite(actualMinutes) || actualMinutes <= 0 || actualMinutes > 1440)) {
      return Response.json({ ok: false, error: "Enter actual minutes between 1 and 1440." }, { status: 400 });
    }''')
block = change(block, 'if (!workoutId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(scheduledDate)) {', 'if (!workoutId || !validCompletionDate(scheduledDate)) {')
block = change(block, '''      const data = await readMemberWorkoutData(memberEmail, studioToken);
      if (!data.plan) {''', '''      let data = await readMemberWorkoutData(memberEmail, studioToken, { requireHistory: true });
      if (!data.plan) {
        const { readLegacyMemberPlan } = await import("@/lib/legacyWorkoutRead");
        const legacy = await readLegacyMemberPlan(memberEmail, studioToken);
        if (legacy.plan) data = { ...data, plan: legacy.plan };
      }
      if (!data.plan) {''')
block = change(block, '''            String(value.workoutId || "") === workoutId &&
            String(value.scheduledDate || "") === scheduledDate &&
            typeof value.completedAt''', '''            (isFlexibleCompletion
              ? value.completionId === completionId
              : String(value.workoutId || "") === workoutId && String(value.scheduledDate || "") === scheduledDate) &&
            typeof value.completedAt''')
block = change(block, '      if (existingCompletion) {\n        return Response.json({', '''      if (existingCompletion) {
        if (isFlexibleCompletion && (existingCompletion.workoutId !== workoutId || existingCompletion.scheduledDate !== scheduledDate)) {
          return Response.json({ ok: false, error: "That session was already saved with different details." }, { status: 409 });
        }
        return Response.json({''')
block = change(block, '      const scheduledPlan = scheduledPlanForWorkout(data.plan, workoutId, scheduledDate);', '''      const scheduledPlan = isFlexibleCompletion
        ? flexiblePlanForCompletion(data.plan, workoutId)
        : scheduledPlanForWorkout(data.plan, workoutId, scheduledDate);''')
block = change(block, '            : "UTC";', '            : verifiedCompletionTimezone(completionInput.timeZone);')
block = change(block, '        planId: String(scheduledPlan.planId || data.plan.planId || "") || null,', '''        ...(isFlexibleCompletion ? { completionId, completionMode: "flexible" } : {}),
        ...(typeof actualMinutes === "number" ? { actualDurationMinutes: actualMinutes } : {}),
        planId: String(scheduledPlan.planId || data.plan.planId || "") || null,''')
block = change(block, '''            !(
              String(value.workoutId || "") === workoutId &&
              String(value.scheduledDate || "") === scheduledDate
            ),''', '''            isFlexibleCompletion ? value.completionId !== completionId : !(
              String(value.workoutId || "") === workoutId &&
              String(value.scheduledDate || "") === scheduledDate
            ),''')
block = change(block, '        [entry, ...previousEntries],\n      );', '        [entry, ...previousEntries],\n        data.historyEntries,\n      );')
route = route[:start] + block + route[end:]
route += r'''

function validCompletionDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function verifiedCompletionTimezone(value: unknown) {
  if (typeof value !== "string" || value.length > 100) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value; }
  catch { return "UTC"; }
}

function flexiblePlanForCompletion(plan: Record<string, unknown>, workoutId: string) {
  const active = activeSavedPlan(plan);
  if (active.scheduleMode !== "flexible_sequence") return null;
  const workouts = active.workouts;
  if (!workouts || typeof workouts !== "object" || Array.isArray(workouts) ||
      !Object.prototype.hasOwnProperty.call(workouts, workoutId)) return null;
  const workout = (workouts as Record<string, unknown>)[workoutId];
  return workout && typeof workout === "object" && !Array.isArray(workout) ? active : null;
}

// Undefined/malformed history is not evidence of an empty log, especially before a write.
function newestCompletionSnapshot(payload: unknown): unknown[] | null {
  const values = collectMemoryValues(payload);
  if (!values.length) {
    const items = memoryPayloadItems(payload);
    const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : null;
    const validList = Array.isArray(payload) || Array.isArray(root?.data) ||
      [root, data].some(node => node && ["memories", "items", "results"].some(key => Array.isArray(node[key])));
    return validList && !items.length ? [] : null;
  }
  const snapshots = values.map(unwrapMemoryValue)
    .filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value))
    .filter(value => Array.isArray(value.entries))
    .sort((a,b) => (Date.parse(String(b.updatedAt || "")) || 0) - (Date.parse(String(a.updatedAt || "")) || 0));
  return snapshots.length ? snapshots[0].entries as unknown[] : null;
}
'''
r.write_text(route)
t = Path('tests/next-week-member-ui.test.mjs')
t.write_text(change(t.read_text(), "      throw new Error('Unexpected import: ' + name);", "      if (name === '@/components/WorkoutHistoryList') return { __esModule: true, default: 'workout-history' };\n      throw new Error('Unexpected import: ' + name);"))
print('Applied guarded flexible tracking and history controls; no member data accessed.')
