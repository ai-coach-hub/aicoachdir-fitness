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
const PICKAXE_REQUEST_TIMEOUTS_MS = [6_000, 10_000];
const USER_MEMORY_READ_TIMEOUTS_MS = [6_000, 10_000];
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

async function readAllUserMemories(fetchImpl, token, email) {
  const response = await pickaxeRequest(
    fetchImpl,
    token,
    `/studio/memory/user/${encodeURIComponent(email)}?skip=0&take=100`,
    USER_MEMORY_READ_TIMEOUTS_MS,
  );
  if (response.status === 404) return { values: [], payload: null };
  if (!response.ok) throw new Error(`user-memory-read-${response.status}`);
  const payload = await response.json();
  return {
    values: collectStoredValues(payload),
    payload,
  };
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
    USER_MEMORY_READ_TIMEOUTS_MS,
  );
  if (response.status === 404) return { values: [], payload: null };
  if (!response.ok) throw new Error(`memory-read-${response.status}`);
  const payload = await response.json();
  return {
    values: collectStoredValues(payload, memoryId),
    payload,
  };
}

async function readLegacyWorkoutMemories(fetchImpl, token, email) {
  const definitionsResponse = await pickaxeRequest(
    fetchImpl,
    token,
    '/studio/memory/list?skip=0&take=100',
  );
  if (!definitionsResponse.ok) {
    throw new Error(`memory-definition-list-${definitionsResponse.status}`);
  }
  const definitions = payloadItems(await definitionsResponse.json());
  const planMemoryId = memoryDefinitionId(findMemoryDefinition(definitions, PLAN_MEMORY_NAMES));
  const historyMemoryId = memoryDefinitionId(findMemoryDefinition(definitions, HISTORY_MEMORY_NAMES));
  if (!planMemoryId && !historyMemoryId) return [];

  const [planResult, historyResult] = await Promise.allSettled([
    planMemoryId
      ? readMemory(fetchImpl, token, email, planMemoryId)
      : Promise.resolve({ values: [], payload: null }),
    historyMemoryId
      ? readMemory(fetchImpl, token, email, historyMemoryId)
      : Promise.resolve({ values: [], payload: null }),
  ]);
  return [
    planResult.status === 'fulfilled' ? planResult.value : { values: [], payload: null },
    historyResult.status === 'fulfilled' ? historyResult.value : { values: [], payload: null },
  ];
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

function summarizeStoredValueShape(value) {
  const summary = {
    rawType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    rawLength: typeof value === 'string' ? value.length : null,
    decodeDepth: 0,
    decodedType: null,
    keys: [],
    scheduleMode: null,
    weekScheduleLength: null,
    flexibleSequenceLength: null,
    workoutsType: null,
    workoutCount: null,
    hasPlanKey: false,
    nestedPlanType: null,
    nestedPlanKeys: [],
    nestedScheduleMode: null,
    nestedWeekScheduleLength: null,
    nestedFlexibleSequenceLength: null,
    nestedWorkoutsType: null,
    nestedWorkoutCount: null,
    hasNextPlan: false,
  };

  let decoded = value;
  for (let depth = 0; depth < 8 && typeof decoded === 'string'; depth += 1) {
    try {
      decoded = JSON.parse(decoded);
      summary.decodeDepth = depth + 1;
    } catch {
      break;
    }
  }

  summary.decodedType = Array.isArray(decoded)
    ? 'array'
    : decoded === null
      ? 'null'
      : typeof decoded;

  if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
    summary.keys = Object.keys(decoded).sort().slice(0, 50);
    summary.scheduleMode = typeof decoded.scheduleMode === 'string' ? decoded.scheduleMode : null;
    summary.weekScheduleLength = Array.isArray(decoded.weekSchedule) ? decoded.weekSchedule.length : null;
    summary.flexibleSequenceLength = Array.isArray(decoded.flexibleSequence) ? decoded.flexibleSequence.length : null;
    summary.workoutsType = Array.isArray(decoded.workouts)
      ? 'array'
      : decoded.workouts && typeof decoded.workouts === 'object'
        ? 'object'
        : decoded.workouts == null ? 'missing' : typeof decoded.workouts;
    summary.workoutCount =
      decoded.workouts && typeof decoded.workouts === 'object'
        ? Array.isArray(decoded.workouts) ? decoded.workouts.length : Object.keys(decoded.workouts).length
        : null;
    summary.hasNextPlan = !!decoded.nextPlan;

    let nested = decoded.plan;
    for (let depth = 0; depth < 4 && typeof nested === 'string'; depth += 1) {
      try {
        nested = JSON.parse(nested);
      } catch {
        break;
      }
    }
    summary.hasPlanKey = decoded.plan != null;
    summary.nestedPlanType = Array.isArray(nested)
      ? 'array'
      : nested === null ? 'null' : typeof nested;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      summary.nestedPlanKeys = Object.keys(nested).sort().slice(0, 50);
      summary.nestedScheduleMode = typeof nested.scheduleMode === 'string' ? nested.scheduleMode : null;
      summary.nestedWeekScheduleLength = Array.isArray(nested.weekSchedule) ? nested.weekSchedule.length : null;
      summary.nestedFlexibleSequenceLength = Array.isArray(nested.flexibleSequence) ? nested.flexibleSequence.length : null;
      summary.nestedWorkoutsType = Array.isArray(nested.workouts)
        ? 'array'
        : nested.workouts && typeof nested.workouts === 'object'
          ? 'object'
          : nested.workouts == null ? 'missing' : typeof nested.workouts;
      summary.nestedWorkoutCount =
        nested.workouts && typeof nested.workouts === 'object'
          ? Array.isArray(nested.workouts) ? nested.workouts.length : Object.keys(nested.workouts).length
          : null;
    }
  }
  return summary;
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
    // Read this verified member's memory collection in one request. This avoids
    // the slower memory-definition lookup plus two separate filtered reads that
    // were timing out in production. The signed HMAC capability already scopes
    // this request to the member email used by the save action.
    const memoryRead = await readAllUserMemories(fetchImpl, token, auth.email);
    let reads = [memoryRead];
    let plan = resolvePlanWindowFromReads(reads, auth, asOfDate);

    // Some older test fixtures and older Pickaxe response paths may not support
    // the unfiltered member-memory read. Keep the previous filtered-reader path
    // only as a compatibility fallback; production should normally finish after
    // the single request above.
    if (!plan && memoryRead.values.length === 0 && memoryRead.payload == null) {
      reads = await readLegacyWorkoutMemories(fetchImpl, token, auth.email);
      plan = resolvePlanWindowFromReads(reads, auth, asOfDate);
    }

    const memoryValues = sourcesFromReads(reads);

    if (!plan) {
      console.info('[workout-plan-read] unresolved-memory-shapes', {
        valueShapes: memoryValues.slice(0, 6).map(summarizeStoredValueShape),
      });
      console.info('[workout-plan-read] plan-not-found', {
        memoryValueCount: memoryValues.length,
      });
      return jsonResponse(
        origin,
        allowedOrigins,
        { ok: false, message: 'Authorized workout plan was not found.' },
        404,
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
        entries: extractHistoryEntries(memoryValues),
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
