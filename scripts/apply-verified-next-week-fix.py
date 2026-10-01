from pathlib import Path
import subprocess

path = Path('app/api/fitness/chat/route.ts')
expected_blob = '7dcaaeb64890545639eec3e8e92a3ac5f83e9200'
actual_blob = subprocess.check_output(['git', 'hash-object', str(path)], text=True).strip()
if actual_blob != expected_blob:
    raise SystemExit('Refusing to patch an unexpected route revision: ' + actual_blob)
source = path.read_text()

def replace(old, new):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit('Expected exactly one patch anchor, found %s: %s' % (count, old[:100]))
    source = source.replace(old, new, 1)

def replace_function(start, following, body):
    global source
    a = source.index(start)
    b = source.index(following, a)
    source = source[:a] + body.rstrip() + '\n\n' + source[b:]

replace('import { createHmac } from "node:crypto";', 'import { createHmac } from "node:crypto";\nimport { isDeepStrictEqual } from "node:util";')
replace_function('function unwrapMemoryValue(', 'function looksLikeFormalWorkoutPlan(', '''function unwrapMemoryValue(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 10; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return current; }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const record = current as Record<string, unknown>;
    const key = ["value", "memoryValue", "memory_value"].find((name) => name in record);
    if (!key) return current;
    current = record[key];
  }
  return current;
}''')
replace_function('function parsePlanFromSavedRun(', 'function dateKeyInTimezone(', '''function parsePlanFromSavedRun(run: SavedPlanRun) {
  let raw = run.parsedArgs?.plan_json;
  if (raw == null && typeof run.args === "string") {
    try { raw = (JSON.parse(run.args) as { plan_json?: unknown }).plan_json; } catch {}
  }
  const plan = unwrapMemoryValue(raw);
  return plan && typeof plan === "object" && !Array.isArray(plan)
    ? plan as Record<string, unknown>
    : null;
}''')
replace('    if (values.some((value) => looksLikeFormalWorkoutPlan(value))) return true;', '    if (values.some((value) => isDeepStrictEqual(unwrapMemoryValue(value), plan))) return true;')
# A failed lookup must not turn a PATCH into an accidental create.
replace('''  const hasExisting =
    existingResponse.ok && collectMemoryValues(await existingResponse.json()).length > 0;

  const storedValue = JSON.stringify(plan);''', '''  if (!existingResponse.ok && existingResponse.status !== 404) return false;
  const hasExisting =
    existingResponse.ok && collectMemoryValues(await existingResponse.json()).length > 0;

  const storedValue = JSON.stringify(plan);''')
replace('function requiresValidatedWorkoutDelivery(message: string) {\n  if (hasWorkoutMutationIntent(message)) return true;', 'function requiresValidatedWorkoutDelivery(message: string) {\n  if (requiresConfirmedSavedPlanMutation(message)) return true;\n  if (hasWorkoutMutationIntent(message)) return true;')
replace('function isSavedPlanReadQuery(message: string) {\n  if (hasWorkoutMutationIntent(message)) return false;', 'function isSavedPlanReadQuery(message: string) {\n  if (requiresConfirmedSavedPlanMutation(message) || hasWorkoutMutationIntent(message)) return false;')
replace('function requiresConfirmedSavedPlanMutation(message: string) {\n  if (explicitlyDeclinesWorkoutSave(message)) return false;', '''function requiresConfirmedSavedPlanMutation(message: string) {
  if (explicitlyDeclinesWorkoutSave(message)) return false;
  // Reading an upcoming week is not permission to create or overwrite it.
  const readOnlyRequest = /\\b(?:what|which|show|list|view|see|tell me)\\b[^.!?\\n]{0,160}\\b(?:workouts?|plan|schedule)\\b/i.test(message);
  const explicitChange = /\\b(?:save|create|build|make|generate|write|design|replace|change|modify|update|edit|swap|reschedule|move|shift|add|remove|delete|revise|adjust)\\b/i.test(message);
  if (readOnlyRequest && !explicitChange) return false;''')
replace('    "Once the Action returns SUCCESS with FINAL_DELIVERY for this turn, relay it exactly and stop; do not run another feasibility attempt.",', '''    "A successful Get Workout Plan or feasibility validation is not a save. For a saved-plan request, continue to Save Workout Plan and wait for its saved-and-verified success before claiming completion. Do not repeat a successful feasibility check.",
    "For next week, send a complete seven-day fixed_weekdays plan with _saveScope set to next_week and the exact next-week dates. Do not replace current_week. Keep each requested session at the requested duration, retain commitments such as classes, and leave future sessions uncompleted.",''')
replace_function('function selectCurrentTurnDelivery(', 'async function pollForFirstValidatedDelivery(', '''function selectCurrentTurnDelivery(
  runs: ActionRun[],
  requestStartedAt: number,
  requireSaved = false,
  excludedRunIds = new Set<string>(),
): RelayResult {
  const currentTurnRuns = currentTurnActionRuns(runs, requestStartedAt)
    .filter((run) => !run.id || !excludedRunIds.has(run.id));
  const analyzed = currentTurnRuns.map((run) => {
    const content = typeof run.content === "string" ? run.content : "";
    const saved =
      run.sourceActionId === SAVE_WORKOUT_PLAN_ACTION_ID &&
      run.status === "success" && !!run.id && !!run.createdAt &&
      Date.parse(run.createdAt) >= Math.floor(requestStartedAt / 1000) * 1000 &&
      content.includes("SUCCESS: Workout plan saved and verified") &&
      !/(?:^|\\n)ERROR:/i.test(content);
    const planPayload = extractPlanPayload(content) || (saved ? parsePlanFromSavedRun(run) : null);
    return {
      run, saved, planPayload,
      finalDelivery: extractFinalDelivery(content) || (saved ? "Workout plan saved and verified." : ""),
      nullPlanPresent: content.includes("PLAN_START::null::PLAN_END"),
      actionErrorPresent: /(?:^|\\n)ERROR:/i.test(content),
      actionMode: parseActionMode(run),
    };
  });
  const successes = analyzed.filter((item) =>
    item.finalDelivery && (!requireSaved || (item.saved && item.planPayload)),
  ).sort((a, b) => Date.parse(b.run.createdAt || "") - Date.parse(a.run.createdAt || ""));
  const selected = successes[0];
  return {
    finalDelivery: selected?.finalDelivery || "",
    runId: selected?.run.id || null,
    runCount: currentTurnRuns.length,
    planPayloadPresent: !!selected?.planPayload,
    // Do not pair a new save receipt with an old Get Plan payload.
    planPayload: selected?.planPayload || null,
    nullPlanPresent: selected?.nullPlanPresent || false,
    actionErrorPresent: !selected && analyzed.some((item) => item.actionErrorPresent),
    actionStatus: selected?.run.status || null,
    actionMode: selected?.actionMode || null,
  };
}''')
replace('''  actionIds: string[] = [GET_WORKOUT_PLAN_ACTION_ID],
): Promise<RelayResult> {''', '''  actionIds: string[] = [GET_WORKOUT_PLAN_ACTION_ID],
  excludedRunIds = new Set<string>(),
): Promise<RelayResult> {''')
replace('      latest = selectCurrentTurnDelivery(runs, requestStartedAt);', '      latest = selectCurrentTurnDelivery(runs, requestStartedAt, actionIds.includes(SAVE_WORKOUT_PLAN_ACTION_ID), excludedRunIds);')
replace('''    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 750);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });''', '''    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, 750);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });''')
replace_function('function extractFormalPlanFromValues(', 'async function readMemberWorkoutData(', '''function extractFormalPlanFromValues(values: unknown[]) {
  const candidates: Record<string, unknown>[] = [];
  for (const value of values) {
    const unwrapped = unwrapMemoryValue(value);
    if (looksLikeFormalWorkoutPlan(unwrapped)) {
      candidates.push(unwrapped as Record<string, unknown>);
      continue;
    }
    if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) continue;
    const wrapper = unwrapped as Record<string, unknown>;
    for (const key of ["plan", "currentPlan", "workoutPlan"]) {
      const nested = unwrapMemoryValue(wrapper[key]);
      if (looksLikeFormalWorkoutPlan(nested)) candidates.push(nested as Record<string, unknown>);
    }
  }
  // Select a root record, not an arbitrary nextPlan child or the oldest memory.
  return candidates.sort((a, b) =>
    (Date.parse(String(b.updatedAt || "")) || 0) - (Date.parse(String(a.updatedAt || "")) || 0),
  )[0] || null;
}''')
replace('''  const standaloneNoSaveWorkout = isStandaloneNoSaveWorkout(message);

  if (!standaloneNoSaveWorkout) {''', '''  const standaloneNoSaveWorkout = isStandaloneNoSaveWorkout(message);
  const mustConfirmSavedPlanMutation = requiresConfirmedSavedPlanMutation(message);
  let planBeforeMutation: Record<string, unknown> | null = null;
  let priorActionRunIds = new Set<string>();
  if (mustConfirmSavedPlanMutation) {
    try {
      const [before, priorRuns] = await Promise.all([
        readMemberWorkoutData(memberEmail, studioToken),
        fetchActionRunsForSession(conversationId, studioToken, [SAVE_WORKOUT_PLAN_ACTION_ID]),
      ]);
      planBeforeMutation = before.plan;
      priorActionRunIds = new Set(priorRuns.flatMap((run) => run.id ? [run.id] : []));
    } catch {
      return Response.json({ ok: false, error: "Your saved plan could not be checked safely. No new workout generation was started." }, { status: 503 });
    }
  }

  if (!standaloneNoSaveWorkout && !mustConfirmSavedPlanMutation) {''')
replace('''  } else {
    console.info("[fitness-chat-relay] standalone-preview", {''', '''  } else if (standaloneNoSaveWorkout) {
    console.info("[fitness-chat-relay] standalone-preview", {''')
replace('''  const mustUseValidatedDelivery = requiresValidatedWorkoutDelivery(message);
  const mustConfirmSavedPlanMutation = requiresConfirmedSavedPlanMutation(message);''', '''  const mustUseValidatedDelivery = requiresValidatedWorkoutDelivery(message);''')
replace('''      [SAVE_WORKOUT_PLAN_ACTION_ID, GET_WORKOUT_PLAN_ACTION_ID],
    );

    mutationCompletionAbort.abort();''', '''      [SAVE_WORKOUT_PLAN_ACTION_ID, GET_WORKOUT_PLAN_ACTION_ID],
      priorActionRunIds,
    );

    mutationCompletionAbort.abort();''')
# Confirm through the same canonical read used by My Workouts, not through generated prose.
replace('''  const actionRunsPresent = relay.runCount > 0;''', '''  let verifiedSavedPlan: Record<string, unknown> | null = null;
  if (mustConfirmSavedPlanMutation) {
    try {
      verifiedSavedPlan = await confirmSavedMutation({
        message, before: planBeforeMutation, candidate: relay.planPayload,
        read: async () => (await readMemberWorkoutData(memberEmail, studioToken)).plan,
        write: async (plan) => {
          attachHistoryBridge(plan, memberEmail, studioToken);
          return writePlanMemory(memberEmail, studioToken, plan);
        },
      });
      console.info("[fitness-chat-relay] saved-plan-readback-verified", {
        conversationId,
        currentWeekStart: fixedWeekStart(verifiedSavedPlan),
        nextWeekStart: nextPlanCandidate(verifiedSavedPlan) ? fixedWeekStart(nextPlanCandidate(verifiedSavedPlan)!) : null,
      });
    } catch (error) {
      console.warn("[fitness-chat-relay] saved-plan-readback-rejected", {
        conversationId, reason: error instanceof Error ? error.message : "verification-failed",
      });
      return Response.json({
        ok: false, conversationId, savedPlanVerified: false,
        error: "The requested workout update could not be verified in My Workouts. It has not been confirmed saved.",
      }, { status: 502 });
    }
  }

  const actionRunsPresent = relay.runCount > 0;''')
replace('''  let finalResponseText =
    isSavedPlanReadQuery(message) && relay.planPayload''', '''  let finalResponseText = verifiedSavedPlan
    ? `Saved and verified in My Workouts.\\n\\n${summarizeSavedPlan(verifiedSavedPlan)}`
    : isSavedPlanReadQuery(message) && relay.planPayload''')
replace('''    response: finalResponseText,
    relaySource,''', '''    response: finalResponseText,
    savedPlanVerified: !!verifiedSavedPlan,
    relaySource,''')
# Appended pure contract functions are exercised by executable tests, not string-presence tests.
source += '''

function planContent(value: Record<string, unknown>, omitNext = false) {
  const copy = clonePlan(value);
  delete copy.updatedAt;
  delete copy._historyBridge;
  delete copy.historyBridge;
  delete copy._handoffProof;
  delete copy._saveScope;
  if (omitNext) delete copy.nextPlan;
  return copy;
}

function matchingWeek(plan: Record<string, unknown> | null, weekStart: string): Record<string, unknown> | null {
  let current = plan;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const rows = Array.isArray(current.weekSchedule) ? current.weekSchedule : [];
    const dates = rows.map((row) => row && typeof row === "object" ? String((row as Record<string, unknown>).date || "") : "").sort();
    if (dates.length === 7 && dates.every((date, i) => date === addDays(weekStart, i))) return current;
    current = nextPlanCandidate(current);
  }
  return null;
}

function samePlanContent(left: Record<string, unknown>, right: Record<string, unknown>, omitNext = false) {
  return isDeepStrictEqual(planContent(left, omitNext), planContent(right, omitNext));
}

function checkRequestedWeek(message: string, plan: Record<string, unknown>, weekStart: string) {
  if (!matchingWeek(plan, weekStart)) throw new Error("requested-week-dates-missing");
  const requestedMinutes = message.match(/\\b(\\d{1,3})\\s*(?:min(?:ute)?s?)\\s*(?:each|per\\s+(?:day|session|workout))\\b/i);
  const weekdays = /\\b(?:m\\s*[-–]\\s*f|mon(?:day)?\\s*(?:-|–|to|through)\\s*fri(?:day)?)\\b/i.test(message);
  if (!weekdays) return;
  const workouts = plan.workouts as Record<string, unknown> | undefined;
  const rows = plan.weekSchedule as Record<string, unknown>[];
  for (let i = 1; i <= 5; i += 1) {
    const row = rows.find((value) => value.date === addDays(weekStart, i));
    const workout = row && workouts ? workouts[String(row.workoutId || "")] as Record<string, unknown> | undefined : null;
    if (!row || row.isRestDay === true || !workout) throw new Error("requested-weekday-workout-missing");
    if (requestedMinutes && Number(workout.durationMinutes) !== Number(requestedMinutes[1])) throw new Error("requested-session-duration-mismatch");
  }
}

async function confirmSavedMutation(args: {
  message: string;
  before: Record<string, unknown> | null;
  candidate: Record<string, unknown> | null;
  read: () => Promise<Record<string, unknown> | null>;
  write: (plan: Record<string, unknown>) => Promise<boolean>;
}) {
  if (!args.candidate || !looksLikeFormalWorkoutPlan(args.candidate)) throw new Error("save-receipt-plan-missing");
  const nextWeek = /\\bnext\\s+week\\b/i.test(args.message);
  const timeZone = String(args.before?.userTimezone || args.candidate.userTimezone || "").trim();
  if (nextWeek && !timeZone) throw new Error("next-week-timezone-missing");
  const weekStart = nextWeek ? addDays(sundayForDate(dateKeyInTimezone(timeZone)), 7) : "";
  const expected = nextWeek ? matchingWeek(args.candidate, weekStart) : args.candidate;
  if (!expected) throw new Error("save-receipt-wrong-week");
  if (nextWeek) checkRequestedWeek(args.message, expected, weekStart);

  let stored: Record<string, unknown> | null = null;
  let target: Record<string, unknown> | null = null;
  // Bounded read-only retries tolerate upstream consistency without repeating a model call or a save.
  for (const delay of [0, 400, 900]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    stored = await args.read();
    target = nextWeek ? matchingWeek(stored, weekStart) : stored;
    if (target && samePlanContent(expected, target, nextWeek)) break;
    target = null;
  }
  if (!stored || !target) throw new Error("saved-candidate-not-present-on-readback");

  if (nextWeek && args.before) {
    const currentBefore = activeSavedPlan(args.before);
    // If the Action stored the next week at the root, explicitly re-stage that
    // verified week under the preserved current week. Never manufacture exercises
    // from chat text, and never restore a snapshot over an unrelated newer edit.
    if (fixedWeekStart(stored) === weekStart && fixedWeekStart(currentBefore) !== weekStart) {
      const stillStored = await args.read();
      if (!stillStored || !isDeepStrictEqual(stillStored, stored)) throw new Error("concurrent-plan-change");
      const staged = clonePlan(currentBefore);
      staged.nextPlan = { effectiveFrom: weekStart, plan: clonePlan(target) };
      staged.updatedAt = new Date().toISOString();
      if (!(await args.write(staged))) throw new Error("next-week-staging-not-verified");
      stored = await args.read();
      if (!stored) throw new Error("staged-plan-readback-missing");
    }
    if (!samePlanContent(currentBefore, activeSavedPlan(stored), true)) throw new Error("current-week-was-modified");
    const next = nextPlanCandidate(activeSavedPlan(stored));
    if (!next || !matchingWeek(next, weekStart) || !samePlanContent(expected, next, true)) throw new Error("next-week-not-staged");
  }
  return stored;
}
'''
path.write_text(source)
print('Applied verified-save selection, exact readback, and next-week staging patch.')
