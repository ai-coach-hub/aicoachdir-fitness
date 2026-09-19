import {
  collectStoredValues,
  createWorkoutHandoffProof,
  extractHistoryEntries,
  memoryDefinitionId,
  memoryDefinitionName,
  parseBridgeAuth,
  payloadItems,
  resolveAuthorizedPlanWindowFromValues,
  verifyBridgeAuth,
} from './bridge-core.mjs';

const PICKAXE_API_BASE = 'https://api.pickaxe.co/v1';
const PLAN_MEMORY_NAMES = new Set(['fitness workout plan v1']);
const HISTORY_MEMORY_NAMES = new Set([
  'fitness workout history v1',
  'fitness workout history for ai coach',
]);
const MAX_BODY_BYTES = 16 * 1024;
const PICKAXE_REQUEST_TIMEOUTS_MS = [5_000, 8_000];
const MEMORY_READ_TIMEOUTS_MS = [4_000, 6_000];
const MEMORY_DEFINITION_CACHE_TTL_MS = 10 * 60 * 1000;
let memoryDefinitionCache = null;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function corsHeaders(origin, allowedOrigins) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function jsonResponse(origin, allowedOrigins, body, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders(origin, allowedOrigins),
  });
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function timeoutSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

async function pickaxeRequest(fetchImpl, token, path, timeouts = PICKAXE_REQUEST_TIMEOUTS_MS) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  let lastError = null;
  for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
    try {
      const response = await fetchImpl(`${PICKAXE_API_BASE}${path}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: timeoutSignal(timeouts[attempt]),
      });
      if (
        attempt < timeouts.length - 1 &&
        RETRYABLE_STATUS_CODES.has(response.status)
      ) {
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= timeouts.length - 1) throw error;
    }
  }

  throw lastError || new Error('pickaxe-request-failed');
}

function findMemoryDefinition(items, acceptedNames) {
  return items.find((item) => {
    const name = memoryDefinitionName(item);
    return !!name && acceptedNames.has(name);
  }) || null;
}

async function readMemory(fetchImpl, token, email, memoryId) {
  const response = await pickaxeRequest(
    fetchImpl,
    token,
    `/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(memoryId)}&skip=0&take=100`,
    MEMORY_READ_TIMEOUTS_MS,
  );
  if (response.status === 404) return { values: [], payload: null };
  if (!response.ok) throw new Error(`memory-read-${response.status}`);
  const payload = await response.json();
  return {
    values: collectStoredValues(payload, memoryId),
    payload,
  };
}

async function getWorkoutMemoryIds(fetchImpl, token) {
  const now = Date.now();
  if (
    memoryDefinitionCache &&
    memoryDefinitionCache.expiresAt > now &&
    (memoryDefinitionCache.planMemoryId || memoryDefinitionCache.historyMemoryId)
  ) {
    return memoryDefinitionCache;
  }

  const definitionsResponse = await pickaxeRequest(
    fetchImpl,
    token,
    '/studio/memory/list?skip=0&take=100',
  );
  if (!definitionsResponse.ok) {
    throw new Error(`memory-definition-list-${definitionsResponse.status}`);
  }

  const definitions = payloadItems(await definitionsResponse.json());
  const planDefinition = findMemoryDefinition(definitions, PLAN_MEMORY_NAMES);
  const historyDefinition = findMemoryDefinition(definitions, HISTORY_MEMORY_NAMES);
  const planMemoryId = memoryDefinitionId(planDefinition);
  const historyMemoryId = memoryDefinitionId(historyDefinition);

  if (!planMemoryId && !historyMemoryId) {
    throw new Error('workout-memory-definitions-missing');
  }

  memoryDefinitionCache = {
    planMemoryId,
    historyMemoryId,
    expiresAt: now + MEMORY_DEFINITION_CACHE_TTL_MS,
  };
  return memoryDefinitionCache;
}

function sourcesFromReads(reads) {
  const sources = [];
  for (const read of reads) {
    if (!read) continue;
    if (Array.isArray(read.values)) sources.push(...read.values);
    if (read.payload != null) sources.push(read.payload);
  }
  return sources;
}

function resolvePlanWindowFromReads(reads, auth, asOfDate) {
  return resolveAuthorizedPlanWindowFromValues(
    sourcesFromReads(reads),
    auth,
    asOfDate,
    { allowLatestFallback: true },
  );
}

export async function handleWorkoutPlanRead({
  request,
  token,
  fetchImpl = fetch,
  allowedOrigins = new Set(['https://studio.pickaxe.co']),
}) {
  const origin = request.headers.get('origin')?.trim() || '';
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Origin not allowed.' }, 403);
  }

  if (!token) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Server is not configured.' }, 503);
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Request body could not be read.' }, 400);
  }
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Invalid request body.' }, 400);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Invalid JSON.' }, 400);
  }

  const auth = parseBridgeAuth(body?.auth);
  const asOfDate = validDateKey(body?.asOfDate);
  if (!auth || !asOfDate) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Invalid authorization payload.' }, 400);
  }
  if (!verifyBridgeAuth(auth, token)) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Authorization failed.' }, 401);
  }

  try {
    // The HMAC already authenticates the member email + plan capability using the
    // same workspace secret as the save action. Avoid a redundant user lookup so
    // one slow Pickaxe endpoint cannot block the plan read.
    const { planMemoryId, historyMemoryId } = await getWorkoutMemoryIds(fetchImpl, token);

    let planRead = { values: [], payload: null };
    let historyRead = { values: [], payload: null };
    let planReadError = null;
    let historyReadError = null;

    const readPlanPromise = planMemoryId
      ? readMemory(fetchImpl, token, auth.email, planMemoryId)
      : Promise.resolve({ values: [], payload: null });
    const readHistoryPromise = historyMemoryId
      ? readMemory(fetchImpl, token, auth.email, historyMemoryId)
      : Promise.resolve({ values: [], payload: null });

    const [planResult, historyResult] = await Promise.allSettled([
      readPlanPromise,
      readHistoryPromise,
    ]);

    if (planResult.status === 'fulfilled') {
      planRead = planResult.value;
    } else {
      planReadError = planResult.reason;
      console.warn('[workout-plan-read] plan-memory-read-failed', {
        name: planResult.reason?.name || 'Error',
        message: String(planResult.reason?.message || planResult.reason).slice(0, 160),
      });
    }

    if (historyResult.status === 'fulfilled') {
      historyRead = historyResult.value;
    } else {
      historyReadError = historyResult.reason;
      console.warn('[workout-plan-read] history-memory-read-failed', {
        name: historyResult.reason?.name || 'Error',
        message: String(historyResult.reason?.message || historyResult.reason).slice(0, 160),
      });
    }

    const plan = resolvePlanWindowFromReads(
      [planRead, historyRead],
      auth,
      asOfDate,
    );

    const planValues = planRead.values;
    const historyValues = historyRead.values;

    if (!plan) {
      console.info('[workout-plan-read] plan-not-found', {
        planValueCount: planValues.length,
        historyValueCount: historyValues.length,
        hasPlanMemoryDefinition: !!planMemoryId,
        hasHistoryMemoryDefinition: !!historyMemoryId,
        planReadFailed: !!planReadError,
        historyReadFailed: !!historyReadError,
      });
      const upstreamFailed = !!planReadError && (!historyMemoryId || !!historyReadError);
      return jsonResponse(
        origin,
        allowedOrigins,
        {
          ok: false,
          message: upstreamFailed
            ? 'Workout plan could not be loaded from Pickaxe.'
            : 'Authorized workout plan was not found.',
        },
        upstreamFailed ? 502 : 404,
      );
    }

    const scheduleDates = Array.isArray(plan?.weekSchedule)
      ? plan.weekSchedule
          .map((entry) => (typeof entry?.date === 'string' ? entry.date : null))
          .filter(Boolean)
          .sort()
      : [];
    const workoutValues =
      plan?.workouts && typeof plan.workouts === 'object' && !Array.isArray(plan.workouts)
        ? Object.values(plan.workouts)
        : [];
    const exerciseCounts = workoutValues.map((workout) =>
      Array.isArray(workout?.exercises) ? workout.exercises.length : -1,
    );
    console.info('[workout-plan-read] resolved-plan-shape', {
      scheduleMode: plan?.scheduleMode || null,
      weekStart: plan?.phase?.weekStart || scheduleDates[0] || null,
      weekEnd: plan?.phase?.weekEnd || scheduleDates[scheduleDates.length - 1] || null,
      weekEntries: Array.isArray(plan?.weekSchedule) ? plan.weekSchedule.length : 0,
      workoutCount: workoutValues.length,
      workoutsMissingExerciseArrays: exerciseCounts.filter((count) => count < 0).length,
      workoutsWithZeroExercises: exerciseCounts.filter((count) => count === 0).length,
      workoutsWithExercises: exerciseCounts.filter((count) => count > 0).length,
      hasNextPlan: !!plan?.nextPlan?.plan,
      nextEffectiveFrom: plan?.nextPlan?.effectiveFrom || null,
    });

    const planBridgeCandidate = parseBridgeAuth(plan?._historyBridge || plan?.historyBridge);
    const proofAuth =
      planBridgeCandidate && verifyBridgeAuth(planBridgeCandidate, token)
        ? planBridgeCandidate
        : auth;
    const handoffProof = createWorkoutHandoffProof(plan, proofAuth, token);
    const planWithHandoffProof = handoffProof
      ? { ...plan, _handoffProof: handoffProof }
      : plan;

    return jsonResponse(
      origin,
      allowedOrigins,
      {
        ok: true,
        plan: planWithHandoffProof,
        entries: historyRead.payload
          ? extractHistoryEntries([...historyValues, historyRead.payload])
          : [],
      },
      200,
    );
  } catch (error) {
    console.error('[workout-plan-read] failed', error);
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Workout plan could not be loaded.' }, 502);
  }
}

export function buildCorsHeaders(origin, allowedOrigins) {
  return corsHeaders(origin, allowedOrigins);
}
