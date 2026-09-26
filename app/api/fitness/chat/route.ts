import { currentUser } from "@clerk/nextjs/server";
import { createHmac } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PICKAXE_COMPLETIONS_URL = "https://api.pickaxe.co/v1/completions";
const PICKAXE_STUDIO_BASE_URL = "https://api.pickaxe.co/v1";
const GET_WORKOUT_PLAN_ACTION_ID = "ACTION7YYK7T0TVOGSV4AZIV45";
const SAVE_WORKOUT_PLAN_ACTION_ID = "ACTIONNYM6UU9XWNX8PQTF79PV";

type MovementRule = {
  id: string;
  label: string;
  pattern: RegExp;
};

const LOWER_BODY_MOVEMENTS: MovementRule[] = [
  { id: "walking", label: "walking", pattern: /\b(?:walk|walking)\b/gi },
  { id: "cycling", label: "cycling", pattern: /\b(?:cycle|cycling|stationary bike|bicycl(?:e|ing))\b/gi },
  { id: "leg_press", label: "leg press", pattern: /\b(?:shallow[- ]range\s+)?leg press\b/gi },
  { id: "squat", label: "squat", pattern: /\b(?:bodyweight |box |goblet |front |back |split |supported |deep |shallow )?squats?\b/gi },
  { id: "lunge", label: "lunge", pattern: /\b(?:reverse |forward |walking |lateral |curtsy )?lunges?\b/gi },
  { id: "step_up", label: "step-up", pattern: /\bstep[- ]?ups?\b/gi },
  { id: "dead_bug", label: "dead bug", pattern: /\bdead bugs?\b/gi },
  { id: "bird_dog", label: "bird dog", pattern: /\bbird dogs?\b/gi },
  { id: "marching", label: "marching", pattern: /\b(?:march|marching)(?: in place)?\b/gi },
  { id: "leg_swing", label: "leg swing", pattern: /\bleg swings?\b/gi },
  { id: "hip_circle", label: "hip circle", pattern: /\bhip circles?\b/gi },
  { id: "quad_stretch", label: "quad stretch", pattern: /\b(?:standing )?(?:quad|quadriceps) stretch(?:es)?\b/gi },
  { id: "hamstring_stretch", label: "hamstring stretch", pattern: /\bhamstring stretch(?:es)?\b/gi },
  { id: "forward_fold", label: "forward fold", pattern: /\b(?:standing |seated )?forward folds?\b/gi },
  { id: "glute_bridge", label: "glute bridge", pattern: /\b(?:glute|hip) bridges?\b/gi },
  { id: "calf_raise", label: "calf raise", pattern: /\bcalf raises?\b/gi },
  { id: "wall_sit", label: "wall sit", pattern: /\bwall sits?\b/gi },
  { id: "hinge", label: "hip hinge", pattern: /\b(?:single[- ]leg )?(?:hip )?hinges?\b/gi },
  { id: "rdl", label: "Romanian deadlift", pattern: /\b(?:romanian deadlifts?|rdls?)\b/gi },
  { id: "deadlift", label: "deadlift", pattern: /\bdeadlifts?\b/gi },
  { id: "good_morning", label: "good morning", pattern: /\bgood mornings?\b/gi },
  { id: "kettlebell_swing", label: "kettlebell swing", pattern: /\bkettlebell swings?\b/gi },
  { id: "mountain_climber", label: "mountain climber", pattern: /\bmountain climbers?\b/gi },
  { id: "bear_crawl", label: "bear crawl", pattern: /\bbear crawls?\b/gi },
  { id: "high_knee", label: "high knees", pattern: /\bhigh knees?\b/gi },
  { id: "butt_kick", label: "butt kick", pattern: /\bbutt kicks?\b/gi },
  { id: "jumping_jack", label: "jumping jack", pattern: /\bjumping jacks?\b/gi },
  { id: "jump_rope", label: "jump rope", pattern: /\b(?:jump rope|rope jumping|skipping rope)\b/gi },
  { id: "burpee", label: "burpee", pattern: /\bburpees?\b/gi },
  { id: "inchworm", label: "inchworm", pattern: /\binchworms?(?: walkouts?)?\b/gi },
  { id: "hip_flexor_stretch", label: "hip-flexor stretch", pattern: /\bhip[- ]flexor stretch(?:es)?\b/gi },
  { id: "figure_four", label: "figure-4 stretch", pattern: /\bfigure[- ]?4(?: hip)? stretch(?:es)?\b/gi },
  { id: "clamshell", label: "clamshell", pattern: /\bclamshells?\b/gi },
  { id: "fire_hydrant", label: "fire hydrant", pattern: /\bfire hydrants?\b/gi },
  { id: "donkey_kick", label: "donkey kick", pattern: /\bdonkey kicks?\b/gi },
  { id: "lateral_band_walk", label: "lateral band walk", pattern: /\blateral band walks?\b/gi },
  { id: "monster_walk", label: "monster walk", pattern: /\bmonster walks?\b/gi },
  { id: "leg_extension", label: "leg extension", pattern: /\bleg extensions?\b/gi },
  { id: "leg_curl", label: "leg curl", pattern: /\bleg curls?\b/gi },
  { id: "running", label: "running/jogging", pattern: /\b(?:run|running|jog|jogging)\b/gi },
  { id: "elliptical", label: "elliptical", pattern: /\belliptical\b/gi },
  { id: "rowing_machine", label: "rowing machine", pattern: /\b(?:rowing machine|rower erg|rowing erg)\b/gi },
];

type Violation = {
  code: string;
  label: string;
  excerpt: string;
};

function primaryEmailForUser(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primaryId = user.primaryEmailAddressId;
  const primary = user.emailAddresses.find((item) => item.id === primaryId);
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "").trim().toLowerCase();
}

function getDeploymentKey() {
  return (
    process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_ID ||
    process.env.PICKAXE_FITNESS_COACH_DEPLOYMENT_TOKEN ||
    process.env.PICKAXE_FITNESS_DEPLOYMENT_TOKEN ||
    process.env.PICKAXE_DEPLOYMENT_API_KEY ||
    ""
  ).trim();
}

function getStudioToken() {
  return (process.env.PICKAXE_WORKSPACE_API_TOKEN || "").trim();
}

function normalizeMemoryName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function memoryPayloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    for (const key of ["memories", "items", "results"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  for (const key of ["memories", "items", "results"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return [];
}

function memoryDefinitionContainers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>;
  return [item, item.definition, item.memoryDefinition, item.memory].filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

function memoryDefinitionName(value: unknown) {
  for (const container of memoryDefinitionContainers(value)) {
    for (const key of ["memory", "slug", "name", "tag", "goal", "title"]) {
      const normalized = normalizeMemoryName(container[key]);
      if (normalized) return normalized;
    }
  }
  return "";
}

function memoryDefinitionId(value: unknown) {
  for (const container of memoryDefinitionContainers(value)) {
    for (const key of ["memoryId", "id", "_id"]) {
      if (typeof container[key] === "string" && container[key]) return String(container[key]);
    }
  }
  return "";
}

function collectMemoryValues(value: unknown, result: unknown[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectMemoryValues(entry, result));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  const record = value as Record<string, unknown>;
  const deleted =
    record.isDeleted === true ||
    record.deleted === true ||
    !!record.deletedAt ||
    String(record.status || "").toLowerCase() === "deleted";
  if (!deleted) {
    for (const key of ["value", "memoryValue", "memory_value"]) {
      if (key in record) result.push(record[key]);
    }
  }
  Object.values(record).forEach((entry) => collectMemoryValues(entry, result));
  return result;
}

function unwrapMemoryValue(value: unknown) {
  let current = value;
  for (let index = 0; index < 5; index += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return current;
      }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    const record = current as Record<string, unknown>;
    for (const key of ["value", "memoryValue", "memory_value"]) {
      if (key in record) {
        current = record[key];
        continue;
      }
    }
    return current;
  }
  return current;
}

function looksLikeFormalWorkoutPlan(value: unknown) {
  const unwrapped = unwrapMemoryValue(value);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return false;
  const record = unwrapped as Record<string, unknown>;
  return (
    !!record.workouts &&
    typeof record.workouts === "object" &&
    !Array.isArray(record.workouts) &&
    (Array.isArray(record.weekSchedule) || Array.isArray(record.flexibleSequence))
  );
}

type SavedPlanRun = {
  id?: string;
  sessionId?: string;
  status?: string;
  content?: string;
  createdAt?: string;
  parsedArgs?: { plan_json?: unknown };
  args?: string;
};

function parsePlanFromSavedRun(run: SavedPlanRun) {
  let raw = run.parsedArgs?.plan_json;
  if (raw == null && typeof run.args === "string") {
    try {
      const parsed = JSON.parse(run.args) as { plan_json?: unknown };
      raw = parsed.plan_json;
    } catch {}
  }

  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const plan = JSON.parse(raw) as Record<string, unknown>;
    return plan && typeof plan === "object" && !Array.isArray(plan) ? plan : null;
  } catch {
    return null;
  }
}

function dateKeyInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sundayForDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return addDays(dateKey, -date.getUTCDay());
}

function fixedWeekStart(plan: Record<string, unknown>) {
  if (plan.scheduleMode !== "fixed_weekdays" || !Array.isArray(plan.weekSchedule)) return "";
  const dates = plan.weekSchedule
    .map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? String((entry as Record<string, unknown>).date || "")
        : "",
    )
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates.length === 7 ? dates[0] : "";
}

function clonePlan(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function attachHistoryBridge(
  plan: Record<string, unknown>,
  email: string,
  token: string,
) {
  const planId = String(plan.planId || "").trim();
  const updatedAt = String(plan.updatedAt || "").trim();
  if (!planId || !updatedAt) return;

  const signature = createHmac("sha256", token)
    .update(`${email}\n${planId}\n${updatedAt}`, "utf8")
    .digest("hex");

  plan._historyBridge = {
    email,
    planId,
    planUpdatedAt: updatedAt,
    signature,
  };

  const nextPlan = plan.nextPlan;
  if (nextPlan && typeof nextPlan === "object" && !Array.isArray(nextPlan)) {
    const nested = (nextPlan as Record<string, unknown>).plan;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      attachHistoryBridge(nested as Record<string, unknown>, email, token);
    }
  }
}

async function findMemberSessionIds(email: string, studioToken: string) {
  const response = await fetch(
    `${PICKAXE_STUDIO_BASE_URL}/studio/workspace/history`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${studioToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        users: [email],
        skip: 0,
        limit: 200,
        lastDays: 60,
        format: "raw",
        sortBy: "created-asc",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) return new Set<string>();
  const payload = (await response.json()) as { data?: unknown[] };
  const sessions = new Set<string>();

  for (const item of Array.isArray(payload.data) ? payload.data : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const userId = String(record.userId || "").trim().toLowerCase();
    const responseId = String(record.responseId || "").trim();
    if (userId === email && responseId) sessions.add(responseId);
  }

  return sessions;
}

function maskMemberEmail(email: string) {
  const [local, domain] = email.split("@", 2);
  if (!local || !domain) return "";
  const maskedLocal =
    local.length <= 2
      ? `${local.slice(0, 1)}*`
      : `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

async function fetchSuccessfulMemberSaveRuns(email: string, studioToken: string) {
  const sessions = await findMemberSessionIds(email, studioToken);

  const url = new URL("/v1/studio/action/runs", "https://api.pickaxe.co");
  url.searchParams.set("actionId", SAVE_WORKOUT_PLAN_ACTION_ID);
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${studioToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    console.info("[fitness-chat-relay] recovery-run-scan", {
      historySessionCount: sessions.size,
      actionRunsStatus: response.status,
      successfulRunCount: 0,
      sessionMatchedRunCount: 0,
      legacyMaskedRunCount: 0,
    });
    return [] as SavedPlanRun[];
  }

  const payload = (await response.json()) as { data?: { runs?: SavedPlanRun[] } };
  const runs = Array.isArray(payload.data?.runs) ? payload.data.runs : [];
  const successfulRuns = runs.filter(
    (run) =>
      run.status === "success" &&
      typeof run.content === "string" &&
      run.content.includes("SUCCESS: Workout plan saved and verified") &&
      !!parsePlanFromSavedRun(run),
  );

  const sessionMatched = successfulRuns.filter(
    (run) => !!run.sessionId && sessions.has(run.sessionId),
  );

  const maskedEmail = maskMemberEmail(email);
  const legacyMasked = maskedEmail
    ? successfulRuns.filter((run) => {
        const content = typeof run.content === "string" ? run.content : "";
        return (
          content.includes(`[save_workout_plan] signed-in member: ${maskedEmail}`) &&
          content.includes(`[save_workout_plan] verified for ${maskedEmail}`)
        );
      })
    : [];

  console.info("[fitness-chat-relay] recovery-run-scan", {
    historySessionCount: sessions.size,
    actionRunsStatus: response.status,
    successfulRunCount: successfulRuns.length,
    sessionMatchedRunCount: sessionMatched.length,
    legacyMaskedRunCount: legacyMasked.length,
  });

  return sessionMatched.length ? sessionMatched : legacyMasked;
}

function newestPlanForWeek(runs: SavedPlanRun[], weekStart: string) {
  return runs
    .map((run) => ({ run, plan: parsePlanFromSavedRun(run) }))
    .filter(
      (item): item is { run: SavedPlanRun; plan: Record<string, unknown> } =>
        !!item.plan && fixedWeekStart(item.plan) === weekStart,
    )
    .sort(
      (left, right) =>
        Date.parse(right.run.createdAt || "") - Date.parse(left.run.createdAt || ""),
    )[0] || null;
}

async function writePlanMemory(
  email: string,
  studioToken: string,
  plan: Record<string, unknown>,
) {
  const headers = {
    Authorization: `Bearer ${studioToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const definitionsResponse = await fetch(
    `${PICKAXE_STUDIO_BASE_URL}/studio/memory/list?skip=0&take=100`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  if (!definitionsResponse.ok) return false;

  const definitions = memoryPayloadItems(await definitionsResponse.json());
  const planNames = new Set(
    ["fitness workout plan v1", "fitness-workout-plan-v1", "fitness_workout_plan_v1"].map(
      normalizeMemoryName,
    ),
  );
  const definition = definitions.find((item) => planNames.has(memoryDefinitionName(item)));
  const memoryId = memoryDefinitionId(definition);
  if (!memoryId) return false;

  const readUrl =
    `${PICKAXE_STUDIO_BASE_URL}/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(memoryId)}&skip=0&take=100`;
  const existingResponse = await fetch(readUrl, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const hasExisting =
    existingResponse.ok && collectMemoryValues(await existingResponse.json()).length > 0;

  const storedValue = JSON.stringify(plan);
  const writeResponse = hasExisting
    ? await fetch(
        `${PICKAXE_STUDIO_BASE_URL}/studio/memory/user/${encodeURIComponent(email)}/${encodeURIComponent(memoryId)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ data: { value: storedValue } }),
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        },
      )
    : await fetch(`${PICKAXE_STUDIO_BASE_URL}/studio/memory/user/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: email, memoryId, value: storedValue }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });

  if (!writeResponse.ok) return false;

  for (const delay of [0, 400, 900]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const verifyResponse = await fetch(readUrl, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!verifyResponse.ok) continue;
    const values = collectMemoryValues(await verifyResponse.json());
    if (values.some((value) => looksLikeFormalWorkoutPlan(value))) return true;
  }

  return false;
}

async function recoverStructuredPlanForMember(email: string, studioToken: string) {
  const runs = await fetchSuccessfulMemberSaveRuns(email, studioToken);
  if (!runs.length) return { attempted: true, restored: false, reason: "no-member-save-runs" };

  const timeZones = runs
    .map((run) => parsePlanFromSavedRun(run)?.userTimezone)
    .filter((value): value is string => typeof value === "string" && !!value.trim());
  const timeZone = timeZones.at(-1) || "UTC";
  const today = dateKeyInTimezone(timeZone);
  if (!today) return { attempted: true, restored: false, reason: "date-resolution" };

  const currentWeekStart = sundayForDate(today);
  const nextWeekStart = addDays(currentWeekStart, 7);
  const current = newestPlanForWeek(runs, currentWeekStart);
  const next = newestPlanForWeek(runs, nextWeekStart);

  if (!current) {
    return { attempted: true, restored: false, reason: "no-current-week-save" };
  }

  const now = new Date().toISOString();
  const restored = clonePlan(current.plan);
  delete restored._saveScope;
  delete restored.nextPlan;
  restored.updatedAt = now;

  if (next) {
    const future = clonePlan(next.plan);
    delete future._saveScope;
    delete future.nextPlan;
    future.updatedAt = now;
    restored.nextPlan = {
      effectiveFrom: nextWeekStart,
      plan: future,
    };
  }

  attachHistoryBridge(restored, email, studioToken);
  const verified = await writePlanMemory(email, studioToken, restored);

  console.info("[fitness-chat-relay] plan-recovery", {
    attempted: true,
    restored: verified,
    currentWeekStart,
    nextWeekPresent: !!next,
    memberSaveRunCount: runs.length,
  });

  return {
    attempted: true,
    restored: verified,
    reason: verified ? "verified" : "write-verification-failed",
  };
}

async function checkFormalPlanForMember(email: string, studioToken: string) {
  try {
    const headers = {
      Authorization: `Bearer ${studioToken}`,
      Accept: "application/json",
    };

    const userResponse = await fetch(
      `${PICKAXE_STUDIO_BASE_URL}/studio/user/${encodeURIComponent(email)}`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );

    const definitionsResponse = await fetch(
      `${PICKAXE_STUDIO_BASE_URL}/studio/memory/list?skip=0&take=100`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );

    if (!definitionsResponse.ok) {
      return {
        userLookupStatus: userResponse.status,
        planDefinitionPresent: false,
        memoryStatus: 0,
        storedValueCount: 0,
        formalPlanPresent: false,
        historyDefinitionPresent: false,
        historyMemoryStatus: 0,
        historyStoredValueCount: 0,
        recoveryPlanPresent: false,
      };
    }

    const definitions = memoryPayloadItems(await definitionsResponse.json());
    const planNames = new Set([
      "fitness workout plan v1",
      "fitness-workout-plan-v1",
      "fitness_workout_plan_v1",
    ].map(normalizeMemoryName));
    const historyNames = new Set([
      "fitness workout history v1",
      "fitness-workout-history-v1",
      "fitness_workout_history_v1",
      "fitness workout history for ai coach",
      "fitness workout history (for ai coach)",
    ].map(normalizeMemoryName));

    const planDefinition = definitions.find((item) => planNames.has(memoryDefinitionName(item)));
    const historyDefinition = definitions.find((item) => historyNames.has(memoryDefinitionName(item)));
    const planMemoryId = memoryDefinitionId(planDefinition);
    const historyMemoryId = memoryDefinitionId(historyDefinition);

    let memoryStatus = 0;
    let storedValueCount = 0;
    let formalPlanPresent = false;

    if (planMemoryId) {
      const memoryResponse = await fetch(
        `${PICKAXE_STUDIO_BASE_URL}/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(planMemoryId)}&skip=0&take=100`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      memoryStatus = memoryResponse.status;
      if (memoryResponse.ok) {
        const values = collectMemoryValues(await memoryResponse.json());
        storedValueCount = values.length;
        formalPlanPresent = values.some((value) => looksLikeFormalWorkoutPlan(value));
      }
    }

    let historyMemoryStatus = 0;
    let historyStoredValueCount = 0;
    let recoveryPlanPresent = false;

    if (historyMemoryId) {
      const historyResponse = await fetch(
        `${PICKAXE_STUDIO_BASE_URL}/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(historyMemoryId)}&skip=0&take=100`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      historyMemoryStatus = historyResponse.status;
      if (historyResponse.ok) {
        const historyValues = collectMemoryValues(await historyResponse.json());
        historyStoredValueCount = historyValues.length;
        recoveryPlanPresent = historyValues.some((value) => {
          const unwrapped = unwrapMemoryValue(value);
          if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return false;
          const record = unwrapped as Record<string, unknown>;
          return (
            looksLikeFormalWorkoutPlan(record.plan) ||
            looksLikeFormalWorkoutPlan(record.currentPlan) ||
            looksLikeFormalWorkoutPlan(record.workoutPlan)
          );
        });
      }
    }

    return {
      userLookupStatus: userResponse.status,
      planDefinitionPresent: !!planMemoryId,
      memoryStatus,
      storedValueCount,
      formalPlanPresent,
      historyDefinitionPresent: !!historyMemoryId,
      historyMemoryStatus,
      historyStoredValueCount,
      recoveryPlanPresent,
    };
  } catch {
    return {
      userLookupStatus: 0,
      planDefinitionPresent: false,
      memoryStatus: 0,
      storedValueCount: 0,
      formalPlanPresent: false,
    };
  }
}

type ActionRun = {
  id?: string;
  sessionId?: string;
  status?: string;
  args?: string;
  parsedArgs?: Record<string, unknown>;
  content?: string;
  createdAt?: string;
};

type RelayResult = {
  finalDelivery: string;
  runId: string | null;
  runCount: number;
  planPayloadPresent: boolean;
  nullPlanPresent: boolean;
  actionErrorPresent: boolean;
  actionStatus: string | null;
  actionMode: string | null;
};

function cleanFinalDelivery(text: string) {
  let cleaned = text.trim();

  // The validator-rendered workout is the deliverable. Drop model-style postscript
  // commentary that appears after a terminal markdown divider.
  const terminalDivider = cleaned.lastIndexOf("\n---\n");
  if (terminalDivider >= 0) {
    const before = cleaned.slice(0, terminalDivider).trim();
    const after = cleaned.slice(terminalDivider + 5).trim();
    const looksLikeWorkout =
      /(?:warm[- ]?up|cool[- ]?down|sets?\s*[×x]|rest:|reps?)/i.test(before);
    const looksLikePostscript =
      /^(?:this workout|this session|this plan|you can|adjust|the pace|it hits|this hits)/i.test(after);

    if (looksLikeWorkout && looksLikePostscript) {
      cleaned = before;
    }
  }

  return cleaned;
}

function parseActionMode(run: ActionRun) {
  const parsedMode = run.parsedArgs?.mode;
  if (typeof parsedMode === "string" && parsedMode.trim()) return parsedMode.trim();

  if (typeof run.args === "string" && run.args.trim()) {
    try {
      const parsed = JSON.parse(run.args) as { mode?: unknown };
      if (typeof parsed.mode === "string" && parsed.mode.trim()) return parsed.mode.trim();
    } catch {}
  }

  return null;
}

function hasPlanPayload(content: string) {
  const start = content.indexOf("PLAN_START::");
  const end = content.indexOf("::PLAN_END");
  if (start < 0 || end < 0 || end <= start) return false;
  const payload = content.slice(start + "PLAN_START::".length, end).trim();
  return payload !== "" && payload !== "null";
}

function extractFinalDelivery(content: string) {
  const startMarker = "FINAL_DELIVERY_START";
  const endMarker = "FINAL_DELIVERY_END";
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);

  if (start < 0 || end < 0 || end <= start) return "";

  return cleanFinalDelivery(content.slice(start + startMarker.length, end));
}

async function fetchActionRunsForSession(sessionId: string, studioToken: string) {
  const url = new URL("/v1/studio/action/runs", "https://api.pickaxe.co");
  url.searchParams.set("actionId", GET_WORKOUT_PLAN_ACTION_ID);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${studioToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Action-run lookup failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: { runs?: ActionRun[] };
  };

  return Array.isArray(payload.data?.runs) ? payload.data.runs : [];
}

function selectCurrentTurnDelivery(runs: ActionRun[], requestStartedAt: number): RelayResult {
  const currentTurnRuns = runs.filter((run) => {
    if (!run.createdAt) return true;
    const created = Date.parse(run.createdAt);
    return Number.isFinite(created) && created >= requestStartedAt - 5_000;
  });

  const analyzedRuns = currentTurnRuns.map((run) => {
    const content = typeof run.content === "string" ? run.content : "";
    return {
      run,
      finalDelivery: extractFinalDelivery(content),
      planPayloadPresent: hasPlanPayload(content),
      nullPlanPresent: content.includes("PLAN_START::null::PLAN_END"),
      actionErrorPresent: /(?:^|\n)ERROR:/i.test(content),
      actionMode: parseActionMode(run),
    };
  });

  const successes = analyzedRuns
    .filter((item) => item.finalDelivery)
    .sort((a, b) => {
      const left = a.run.createdAt ? Date.parse(a.run.createdAt) : 0;
      const right = b.run.createdAt ? Date.parse(b.run.createdAt) : 0;
      return left - right;
    });

  if (successes.length > 0) {
    return {
      finalDelivery: successes[0].finalDelivery,
      runId: successes[0].run.id || null,
      runCount: currentTurnRuns.length,
      planPayloadPresent: analyzedRuns.some((item) => item.planPayloadPresent),
      nullPlanPresent: analyzedRuns.some((item) => item.nullPlanPresent),
      actionErrorPresent: analyzedRuns.some((item) => item.actionErrorPresent),
      actionStatus: successes[0].run.status || null,
      actionMode: successes[0].actionMode,
    };
  }

  return {
    finalDelivery: "",
    runId: null,
    runCount: currentTurnRuns.length,
    planPayloadPresent: analyzedRuns.some((item) => item.planPayloadPresent),
    nullPlanPresent: analyzedRuns.some((item) => item.nullPlanPresent),
    actionErrorPresent: analyzedRuns.some((item) => item.actionErrorPresent),
    actionStatus: analyzedRuns[0]?.run.status || null,
    actionMode: analyzedRuns[0]?.actionMode || null,
  };
}

async function pollForFirstValidatedDelivery(
  sessionId: string,
  studioToken: string,
  requestStartedAt: number,
  signal: AbortSignal,
): Promise<RelayResult> {
  let latest: RelayResult = {
    finalDelivery: "",
    runId: null,
    runCount: 0,
    planPayloadPresent: false,
    nullPlanPresent: false,
    actionErrorPresent: false,
    actionStatus: null,
    actionMode: null,
  };

  while (!signal.aborted) {
    const runs = await fetchActionRunsForSession(sessionId, studioToken);
    latest = selectCurrentTurnDelivery(runs, requestStartedAt);
    if (latest.finalDelivery) return latest;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  return latest;
}


function requiresValidatedWorkoutDelivery(message: string) {
  const normalized = message.toLowerCase();

  const explicitReadOnly =
    /\b(?:what|which|show|list|view|see|tell me)\b[^.!?\n]{0,80}\b(?:workouts?|plan|schedule)\b/.test(normalized) ||
    /\b(?:current|saved|existing)\b[^.!?\n]{0,60}\b(?:workouts?|plan|schedule)\b/.test(normalized);

  if (explicitReadOnly) return false;

  return /\b(?:create|build|make|generate|write|design|replace|change|modify|update|edit|swap|reschedule|schedule|add|remove|delete|revise|adjust)\b[^.!?\n]{0,100}\b(?:workout|plan|schedule|day|exercise|session)\b/.test(normalized) ||
    /\b(?:new|next)\b[^.!?\n]{0,60}\b(?:workout|plan|schedule)\b/.test(normalized);
}

function getPositiveClause(message: string) {
  const pieces = message
    .split(/\bbut\b|[.!?]/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const positive = pieces.find((part) =>
    /\b(?:comfortable|pain[- ]?free|feel(?:s)? fine|tolerat(?:e|ed|es)|okay|ok)\b/i.test(part),
  );

  return positive || "";
}

function collectAllowedMovementIds(message: string) {
  const positiveClause = getPositiveClause(message);
  if (!positiveClause) return new Set<string>();

  const allowed = new Set<string>();
  for (const rule of LOWER_BODY_MOVEMENTS) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(positiveClause)) allowed.add(rule.id);
  }
  return allowed;
}

function hasRestriction(message: string) {
  return /\b(?:pain|painful|irritat(?:e|es|ed|ing)|restriction|restricted|avoid|bother(?:s|ed)?|hurt(?:s|ing)?|aggravat(?:e|es|ed|ing)|can(?:not|'t))\b/i.test(
    message,
  );
}

function isNegated(text: string, start: number, end: number) {
  const before = text.slice(Math.max(0, start - 55), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 45)).toLowerCase();

  const negationBefore =
    /(?:\bno\b|\bnot\b|\bavoid(?:ing)?\b|\bexclude(?:d|s|ing)?\b|\bwithout\b|\bskip(?:ping)?\b|\bnever\b|\bdo not\b|\bdon't\b|\bremove(?:d|s|ing)?\b|\bblock(?:ed|s|ing)?\b|\bprohibit(?:ed|s|ing)?\b)[^.!?\n]{0,35}$/i;

  const negationAfter =
    /^\s*(?:is|are|was|were|remain|remains)?\s*(?:excluded|avoided|not allowed|off[- ]limits|prohibited|blocked)/i;

  return negationBefore.test(before) || negationAfter.test(after);
}

function excerpt(text: string, start: number, end: number) {
  const left = Math.max(0, start - 55);
  const right = Math.min(text.length, end + 75);
  return text.slice(left, right).replace(/\s+/g, " ").trim();
}

function validateMovementAllowlist(message: string, responseText: string) {
  const violations: Violation[] = [];
  if (!hasRestriction(message)) return violations;

  const allowedIds = collectAllowedMovementIds(message);
  if (!allowedIds.size) return violations;

  for (const rule of LOWER_BODY_MOVEMENTS) {
    rule.pattern.lastIndex = 0;
    for (const match of responseText.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (allowedIds.has(rule.id) || isNegated(responseText, start, end)) continue;

      violations.push({
        code: "LOWER_BODY_ALLOWLIST",
        label: `${rule.label} is outside the user's explicit lower-body allowlist`,
        excerpt: excerpt(responseText, start, end),
      });
    }
  }

  return violations;
}

function validateInventedJointTargets(message: string, responseText: string) {
  const violations: Violation[] = [];
  if (!hasRestriction(message)) return violations;

  const userAlreadyProvidedAngle = /\b\d{1,3}\s*(?:°|degrees?|deg)\b/i.test(message);
  if (userAlreadyProvidedAngle) return violations;

  const anglePattern = /\b\d{1,3}\s*(?:°|degrees?|deg)\b/gi;
  for (const match of responseText.matchAll(anglePattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const context = responseText.slice(Math.max(0, start - 90), Math.min(responseText.length, end + 90));

    if (/\b(?:knee|hip|ankle|leg press|squat|lunge|step[- ]?up|depth|flexion|extension)\b/i.test(context)) {
      violations.push({
        code: "INVENTED_JOINT_TARGET",
        label: `invented lower-body joint/setup target: ${match[0]}`,
        excerpt: excerpt(responseText, start, end),
      });
    }
  }

  return violations;
}

function dedupeViolations(violations: Violation[]) {
  const seen = new Set<string>();
  return violations.filter((item) => {
    const key = `${item.code}|${item.label}|${item.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractResult(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const result = (payload as { result?: unknown }).result;
  if (typeof result === "string") return result;
  if (result == null) return "";
  return JSON.stringify(result, null, 2);
}

export async function POST(request: Request) {
  const user = await currentUser();
  const memberEmail = primaryEmailForUser(user);
  if (!user || !memberEmail) {
    return Response.json({ ok: false, error: "Sign in is required." }, { status: 401 });
  }

  const deploymentKey = getDeploymentKey();
  const studioToken = getStudioToken();
  if (!deploymentKey || !studioToken) {
    return Response.json(
      { ok: false, error: "Fitness Coach relay is not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const message =
    body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";

  const requestedConversationId =
    body &&
    typeof body === "object" &&
    typeof (body as { conversationId?: unknown }).conversationId === "string"
      ? (body as { conversationId: string }).conversationId.trim()
      : "";

  if (!message || message.length > 12_000) {
    return Response.json({ ok: false, error: "Message is required and must be under 12,000 characters." }, { status: 400 });
  }

  const conversationId = /^fitness-chat-[A-Za-z0-9_-]{8,120}$/.test(requestedConversationId)
    ? requestedConversationId
    : `fitness-chat-${crypto.randomUUID()}`;

  let directPlanCheck = await checkFormalPlanForMember(memberEmail, studioToken);
  console.info("[fitness-chat-relay] direct-plan-check", directPlanCheck);

  if (
    !directPlanCheck.formalPlanPresent &&
    requiresValidatedWorkoutDelivery(message) === false
  ) {
    const recovery = await recoverStructuredPlanForMember(memberEmail, studioToken);
    console.info("[fitness-chat-relay] recovery-result", recovery);
    if (recovery.restored) {
      directPlanCheck = await checkFormalPlanForMember(memberEmail, studioToken);
      console.info("[fitness-chat-relay] direct-plan-check-after-recovery", directPlanCheck);
    }
  }

  const requestStartedAt = Date.now();
  const completionAbort = new AbortController();
  const pollAbort = new AbortController();

  const completionPromise = (async () => {
    let pickaxeResponse: Response;
    try {
      pickaxeResponse = await fetch(PICKAXE_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deploymentKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          message,
          userId: memberEmail,
          conversationId,
          stream: false,
        }),
        cache: "no-store",
        signal: AbortSignal.any([
          completionAbort.signal,
          AbortSignal.timeout(115_000),
        ]),
      });
    } catch {
      if (completionAbort.signal.aborted) {
        return { kind: "aborted" as const };
      }
      return { kind: "error" as const, response: Response.json({ ok: false, error: "Pickaxe request timed out or failed." }, { status: 502 }) };
    }

    const raw = await pickaxeResponse.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!pickaxeResponse.ok) {
      return {
        kind: "error" as const,
        response: Response.json(
          {
            ok: false,
            error: "Pickaxe completion failed.",
            status: pickaxeResponse.status,
            detail:
              payload && typeof payload === "object"
                ? ((payload as { message?: unknown }).message ?? (payload as { error?: unknown }).error ?? null)
                : null,
          },
          { status: 502 },
        ),
      };
    }

    const responseText = extractResult(payload);
    if (!responseText) {
      return {
        kind: "error" as const,
        response: Response.json({ ok: false, error: "Pickaxe returned no response text." }, { status: 502 }),
      };
    }

    return { kind: "completion" as const, responseText };
  })();

  const relayPromise = pollForFirstValidatedDelivery(
    conversationId,
    studioToken,
    requestStartedAt,
    pollAbort.signal,
  )
    .then((relay) => ({ kind: "relay" as const, relay }))
    .catch(() => ({ kind: "relay-error" as const }));

  const first = await Promise.race([completionPromise, relayPromise]);

  let relay: RelayResult = {
    finalDelivery: "",
    runId: null,
    runCount: 0,
    planPayloadPresent: false,
    nullPlanPresent: false,
    actionErrorPresent: false,
    actionStatus: null,
    actionMode: null,
  };
  let responseText = "";

  if (first.kind === "relay" && first.relay.finalDelivery) {
    relay = first.relay;
    completionAbort.abort();
  } else if (first.kind === "relay-error") {
    pollAbort.abort();
    const completion = await completionPromise;
    if (completion.kind === "error") return completion.response;
    if (completion.kind === "completion") responseText = completion.responseText;
  } else {
    if (first.kind === "error") {
      pollAbort.abort();
      return first.response;
    }
    if (first.kind === "completion") responseText = first.responseText;

    // Completion finished first. Give the Action store a short consistency window,
    // then use the current-turn Action result if one exists.
    const consistencyDeadline = Date.now() + 4_000;
    while (Date.now() < consistencyDeadline && !relay.finalDelivery) {
      try {
        const runs = await fetchActionRunsForSession(conversationId, studioToken);
        relay = selectCurrentTurnDelivery(runs, requestStartedAt);
      } catch {
        break;
      }
      if (!relay.finalDelivery) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  pollAbort.abort();

  const actionRunsPresent = relay.runCount > 0;
  const mustUseValidatedDelivery = requiresValidatedWorkoutDelivery(message);
  if (actionRunsPresent && !relay.finalDelivery && mustUseValidatedDelivery) {
    return Response.json(
      {
        ok: false,
        blocked: true,
        error: "The coach invoked workout feasibility validation, but no successful FINAL_DELIVERY was available for this exact turn.",
        conversationId,
        relaySource: "action-session-fail-closed",
        actionRunCount: relay.runCount,
      },
      { status: 422 },
    );
  }

  const finalResponseText = relay.finalDelivery || responseText;
  if (!finalResponseText) {
    return Response.json(
      { ok: false, error: "No completed assistant or validated Action response was available." },
      { status: 502 },
    );
  }

  const relaySource = relay.finalDelivery
    ? "action-final-delivery"
    : actionRunsPresent
      ? "assistant-response-read-only-action"
      : "assistant-response";

  const violations = dedupeViolations([
    ...validateMovementAllowlist(message, finalResponseText),
    ...validateInventedJointTargets(message, finalResponseText),
  ]);

  if (violations.length) {
    console.warn("[fitness-chat-relay] blocked", {
      conversationId,
      codes: violations.map((item) => item.code),
      labels: violations.map((item) => item.label),
    });

    return Response.json(
      {
        ok: false,
        blocked: true,
        conversationId,
        violations,
      },
      { status: 422 },
    );
  }

  console.info("[fitness-chat-relay] relay-result", {
    conversationId,
    relaySource,
    actionRunCount: relay.runCount,
    actionRunId: relay.runId,
    planPayloadPresent: relay.planPayloadPresent,
    nullPlanPresent: relay.nullPlanPresent,
    actionErrorPresent: relay.actionErrorPresent,
    actionStatus: relay.actionStatus,
    actionMode: relay.actionMode,
  });

  return Response.json({
    ok: true,
    blocked: false,
    conversationId,
    response: finalResponseText,
    relaySource,
    actionRunCount: relay.runCount,
    actionRunId: relay.runId,
    planPayloadPresent: relay.planPayloadPresent,
    nullPlanPresent: relay.nullPlanPresent,
    actionErrorPresent: relay.actionErrorPresent,
    actionStatus: relay.actionStatus,
    actionMode: relay.actionMode,
    memberAuthenticated: true,
  });
}
