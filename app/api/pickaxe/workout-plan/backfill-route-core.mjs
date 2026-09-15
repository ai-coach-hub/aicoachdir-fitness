import { createHmac, timingSafeEqual } from 'node:crypto';
import { backfillStoredWorkoutValue } from './backfill-core.mjs';

const PICKAXE_API_BASE = 'https://api.pickaxe.co/v1';
const PLAN_MEMORY_NAMES = new Set(['fitness workout plan v1']);
const HISTORY_MEMORY_NAMES = new Set([
  'fitness workout history v1',
  'fitness workout history for ai coach',
]);
const CONFIRMATION = 'BACKFILL_WORKOUT_BRIDGES_V1';

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function parseAuth(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const email = normalizeEmail(value.email);
  const planId = typeof value.planId === 'string' ? value.planId.trim() : '';
  const planUpdatedAt = typeof value.planUpdatedAt === 'string' ? value.planUpdatedAt.trim() : '';
  const signature = typeof value.signature === 'string' ? value.signature.trim().toLowerCase() : '';
  if (
    !email ||
    !planId ||
    !planUpdatedAt ||
    Number.isNaN(new Date(planUpdatedAt).getTime()) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return null;
  }
  return { email, planId, planUpdatedAt, signature };
}

function verifyAuth(auth, token) {
  const expected = createHmac('sha256', token)
    .update(`${auth.email}\n${auth.planId}\n${auth.planUpdatedAt}`, 'utf8')
    .digest();
  const actual = Buffer.from(auth.signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function corsHeaders(origin, allowedOrigins) {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function jsonResponse(origin, allowedOrigins, body, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(origin, allowedOrigins) });
}

async function pickaxeRequest(fetchImpl, token, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  return fetchImpl(`${PICKAXE_API_BASE}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
  });
}

function payloadItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'users', 'memories', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    for (const key of ['items', 'users', 'memories', 'results']) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
  }
  return [];
}

function normalizeMemoryName(value) {
  if (typeof value !== 'string') return null;
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function memoryMeta(item) {
  const containers = [item, item?.definition, item?.memoryDefinition, item?.memory].filter(
    (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
  );
  let id = null;
  let name = null;
  for (const container of containers) {
    if (!id) id = container.memoryId || container.id || container._id || null;
    if (!name) {
      for (const key of ['memory', 'slug', 'name', 'tag', 'goal', 'title']) {
        const normalized = normalizeMemoryName(container[key]);
        if (normalized) {
          name = normalized;
          break;
        }
      }
    }
  }
  return { id: id ? String(id) : null, name };
}

function userEmail(item) {
  for (const candidate of [item?.email, item?.user?.email, item?.data?.email]) {
    const email = normalizeEmail(candidate);
    if (email) return email;
  }
  return null;
}

function collectValuesForMemory(payload, memoryId) {
  const values = [];

  function recordMemoryId(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    if (record.memoryId || record.memory_id) return String(record.memoryId || record.memory_id);
    for (const key of ['memory', 'definition', 'memoryDefinition']) {
      const nested = record[key];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        if (nested.memoryId || nested.id || nested._id) {
          return String(nested.memoryId || nested.id || nested._id);
        }
      }
    }
    return null;
  }

  function visit(node) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const deleted =
      node.isDeleted === true ||
      node.deleted === true ||
      !!node.deletedAt ||
      String(node.status || '').toLowerCase() === 'deleted';
    if (!deleted) {
      for (const key of ['value', 'memoryValue', 'memory_value']) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        const id = recordMemoryId(node);
        if (id == null || id === memoryId) values.push(node[key]);
        break;
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['value', 'memoryValue', 'memory_value'].includes(key)) visit(child);
    }
  }

  visit(payload);
  return values;
}

async function listAllUsers(fetchImpl, token) {
  const users = [];
  const take = 100;
  for (let skip = 0; skip < 5000; skip += take) {
    const response = await pickaxeRequest(fetchImpl, token, `/studio/user/list?skip=${skip}&take=${take}`);
    if (!response.ok) throw new Error(`user-list-${response.status}`);
    const batch = payloadItems(await response.json());
    if (!batch.length) break;
    for (const item of batch) {
      const email = userEmail(item);
      if (email) users.push(email);
    }
    if (batch.length < take) break;
  }
  return [...new Set(users)];
}

async function readMemory(fetchImpl, token, email, memoryId) {
  const response = await pickaxeRequest(
    fetchImpl,
    token,
    `/studio/memory/user/${encodeURIComponent(email)}?memoryId=${encodeURIComponent(memoryId)}&skip=0&take=100`,
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`memory-read-${response.status}`);
  return collectValuesForMemory(await response.json(), memoryId);
}

async function patchMemory(fetchImpl, token, email, memoryId, value) {
  const response = await pickaxeRequest(
    fetchImpl,
    token,
    `/studio/memory/user/${encodeURIComponent(email)}/${encodeURIComponent(memoryId)}`,
    { method: 'PATCH', body: JSON.stringify({ data: { value } }) },
  );
  if (!response.ok) throw new Error(`memory-write-${response.status}`);
}

export async function handleWorkoutBridgeBackfill({
  request,
  token,
  fetchImpl = fetch,
  allowedOrigins = new Set(['https://studio.pickaxe.co']),
}) {
  const origin = request.headers.get('origin')?.trim() || '';
  if (!origin || !allowedOrigins.has(origin)) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Origin not allowed.' }, 403);
  }
  if (!token) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Server is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Invalid request.' }, 400);
  }

  const auth = parseAuth(body?.auth);
  if (!auth || body?.confirm !== CONFIRMATION) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Invalid migration request.' }, 400);
  }
  if (!verifyAuth(auth, token)) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Authorization failed.' }, 401);
  }
  const dryRun = body?.dryRun !== false;

  try {
    const requester = await pickaxeRequest(fetchImpl, token, `/studio/user/${encodeURIComponent(auth.email)}`);
    if (!requester.ok) {
      return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Requester could not be verified.' }, 404);
    }

    const definitionsResponse = await pickaxeRequest(fetchImpl, token, '/studio/memory/list?skip=0&take=100');
    if (!definitionsResponse.ok) throw new Error(`memory-list-${definitionsResponse.status}`);
    const memoryIds = payloadItems(await definitionsResponse.json())
      .map(memoryMeta)
      .filter(({ id, name }) => id && name && (PLAN_MEMORY_NAMES.has(name) || HISTORY_MEMORY_NAMES.has(name)))
      .map(({ id }) => id);
    if (!memoryIds.length) throw new Error('workout-memory-definitions-missing');

    const users = await listAllUsers(fetchImpl, token);
    let usersChanged = 0;
    let memoriesChanged = 0;
    let bridgesAdded = 0;
    let failures = 0;

    for (const email of users) {
      let changedForUser = false;
      for (const memoryId of memoryIds) {
        try {
          const values = await readMemory(fetchImpl, token, email, memoryId);
          if (values.length > 1) {
            failures += 1;
            continue;
          }
          if (values.length === 0) continue;
          const result = backfillStoredWorkoutValue(values[0], email, token);
          if (!result.changed) continue;
          changedForUser = true;
          memoriesChanged += 1;
          bridgesAdded += result.bridgesAdded;
          if (!dryRun) await patchMemory(fetchImpl, token, email, memoryId, result.value);
        } catch {
          failures += 1;
        }
      }
      if (changedForUser) usersChanged += 1;
    }

    return jsonResponse(origin, allowedOrigins, {
      ok: true,
      dryRun,
      usersScanned: users.length,
      usersChanged,
      memoriesChanged,
      bridgesAdded,
      failures,
    });
  } catch (error) {
    console.error('[workout-bridge-backfill] failed', error);
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Workout bridge migration failed.' }, 502);
  }
}

export function buildBackfillCorsHeaders(origin, allowedOrigins) {
  return corsHeaders(origin, allowedOrigins);
}
