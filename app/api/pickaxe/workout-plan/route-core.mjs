import {
  collectStoredValues,
  extractHistoryEntries,
  memoryDefinitionId,
  memoryDefinitionName,
  parseBridgeAuth,
  payloadItems,
  resolveAuthorizedPlanFromValues,
  verifyBridgeAuth,
} from './bridge-core.mjs';

const PICKAXE_API_BASE = 'https://api.pickaxe.co/v1';
const PLAN_MEMORY_NAMES = new Set(['fitness workout plan v1']);
const HISTORY_MEMORY_NAMES = new Set([
  'fitness workout history v1',
  'fitness workout history for ai coach',
]);
const MAX_BODY_BYTES = 16 * 1024;

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

async function pickaxeRequest(fetchImpl, token, path) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });
  return fetchImpl(`${PICKAXE_API_BASE}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
  });
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
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`memory-read-${response.status}`);
  const payload = await response.json();
  return collectStoredValues(payload, memoryId);
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
    const userResponse = await pickaxeRequest(
      fetchImpl,
      token,
      `/studio/user/${encodeURIComponent(auth.email)}`,
    );
    if (!userResponse.ok) {
      return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Member could not be verified.' }, 404);
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

    const [planValues, historyValues] = await Promise.all([
      planMemoryId ? readMemory(fetchImpl, token, auth.email, planMemoryId) : Promise.resolve([]),
      historyMemoryId ? readMemory(fetchImpl, token, auth.email, historyMemoryId) : Promise.resolve([]),
    ]);

    const plan = resolveAuthorizedPlanFromValues(
      [...planValues, ...historyValues],
      auth,
      asOfDate,
    );
    if (!plan) {
      return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Authorized workout plan was not found.' }, 404);
    }

    return jsonResponse(
      origin,
      allowedOrigins,
      {
        ok: true,
        plan,
        entries: extractHistoryEntries(historyValues),
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
