import { createHmac, timingSafeEqual } from 'node:crypto';

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

export function parseBridgeAuth(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const email = normalizeEmail(value.email);
  const planId = typeof value.planId === 'string' ? value.planId.trim().slice(0, 200) : '';
  const planUpdatedAt =
    typeof value.planUpdatedAt === 'string' ? value.planUpdatedAt.trim() : '';
  const signature =
    typeof value.signature === 'string' ? value.signature.trim().toLowerCase() : '';

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

function signatureMessage(auth) {
  return `${auth.email}\n${auth.planId}\n${auth.planUpdatedAt}`;
}

export function verifyBridgeAuth(auth, token) {
  if (!auth || !token) return false;
  const expected = createHmac('sha256', token)
    .update(signatureMessage(auth), 'utf8')
    .digest();
  const supplied = Buffer.from(auth.signature || '', 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}


function handoffWorkoutsFromPlan(plan) {
  const map = new Map();
  const visit = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
    const workouts = candidate.workouts;
    if (workouts && typeof workouts === 'object' && !Array.isArray(workouts)) {
      for (const [key, workout] of Object.entries(workouts)) {
        if (!workout || typeof workout !== 'object' || Array.isArray(workout)) continue;
        const id = String(workout.id || key || '').trim().slice(0, 200);
        const title = String(workout.title || workout.name || '').trim().slice(0, 200);
        if (id && title) map.set(id, title);
      }
    }
    visit(candidate.nextPlan?.plan);
  };
  visit(plan);
  return [...map.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function handoffProofMessage(proof) {
  return [
    proof.email,
    proof.planId,
    proof.planUpdatedAt,
    proof.issuedAt,
    proof.expiresAt,
    JSON.stringify(proof.workouts),
  ].join('\n');
}

export function createWorkoutHandoffProof(plan, auth, token, now = new Date()) {
  if (!plan || !auth || !token) return null;
  const workouts = handoffWorkoutsFromPlan(plan);
  if (!workouts.length) return null;
  const issued = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(issued.getTime())) return null;
  const proof = {
    email: auth.email,
    planId: auth.planId,
    planUpdatedAt: auth.planUpdatedAt,
    issuedAt: issued.toISOString(),
    expiresAt: new Date(issued.getTime() + 30 * 60 * 1000).toISOString(),
    workouts,
  };
  const signature = createHmac('sha256', token)
    .update(handoffProofMessage(proof), 'utf8')
    .digest('hex');
  return { ...proof, signature };
}

export function verifyWorkoutHandoffProof(value, auth, token, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !auth || !token) return null;
  const email = normalizeEmail(value.email);
  const planId = typeof value.planId === 'string' ? value.planId.trim() : '';
  const planUpdatedAt = typeof value.planUpdatedAt === 'string' ? value.planUpdatedAt.trim() : '';
  const issuedAt = typeof value.issuedAt === 'string' ? value.issuedAt.trim() : '';
  const expiresAt = typeof value.expiresAt === 'string' ? value.expiresAt.trim() : '';
  const signature = typeof value.signature === 'string' ? value.signature.trim().toLowerCase() : '';
  if (
    !email ||
    email !== auth.email ||
    planId !== auth.planId ||
    planUpdatedAt !== auth.planUpdatedAt ||
    !issuedAt ||
    !expiresAt ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) return null;

  const issuedMs = new Date(issuedAt).getTime();
  const expiresMs = new Date(expiresAt).getTime();
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  if (
    Number.isNaN(issuedMs) ||
    Number.isNaN(expiresMs) ||
    Number.isNaN(nowMs) ||
    expiresMs <= issuedMs ||
    nowMs > expiresMs ||
    issuedMs > nowMs + 5 * 60 * 1000
  ) return null;

  const workouts = Array.isArray(value.workouts)
    ? value.workouts
        .map((item) => ({
          id: typeof item?.id === 'string' ? item.id.trim().slice(0, 200) : '',
          title: typeof item?.title === 'string' ? item.title.trim().slice(0, 200) : '',
        }))
        .filter((item) => item.id && item.title)
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  if (!workouts.length) return null;

  const proof = { email, planId, planUpdatedAt, issuedAt, expiresAt, workouts };
  const expected = createHmac('sha256', token)
    .update(handoffProofMessage(proof), 'utf8')
    .digest();
  const supplied = Buffer.from(signature, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { ...proof, signature };
}

export function resolveWorkoutFromHandoffProof(proof, workoutId) {
  if (!proof || !Array.isArray(proof.workouts) || typeof workoutId !== 'string') return null;
  const target = workoutId.trim();
  const match = proof.workouts.find((item) => item.id === target);
  return match ? { id: match.id, title: match.title } : null;
}

export function unwrapStoredValue(value) {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === 'string') {
      try {
        current = JSON.parse(current);
        continue;
      } catch {
        return current;
      }
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
    if (Object.prototype.hasOwnProperty.call(current, 'value')) {
      current = current.value;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(current, 'memoryValue')) {
      current = current.memoryValue;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(current, 'memory_value')) {
      current = current.memory_value;
      continue;
    }
    return current;
  }
  return current;
}

function isIsoDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUsablePlan(value) {
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray(value.weekSchedule) &&
    value.weekSchedule.length > 0 &&
    value.workouts &&
    typeof value.workouts === 'object' &&
    !Array.isArray(value.workouts) &&
    Object.keys(value.workouts).length > 0
  );
}

function matchesAuthIdentity(value, auth) {
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    String(value.planId || '') === auth.planId &&
    String(value.updatedAt || '') === auth.planUpdatedAt
  );
}

function candidatePlansFromDecoded(decoded) {
  const candidates = [];
  const seen = new WeakSet();

  function visit(value, depth = 0) {
    if (depth > 10) return;

    const unwrapped = unwrapStoredValue(value);

    if (Array.isArray(unwrapped)) {
      for (const item of unwrapped) visit(item, depth + 1);
      return;
    }

    if (!unwrapped || typeof unwrapped !== 'object') return;
    if (seen.has(unwrapped)) return;
    seen.add(unwrapped);

    if (isUsablePlan(unwrapped)) candidates.push(unwrapped);

    // Pickaxe memory responses have appeared behind several wrapper shapes over
    // time. Traverse object children defensively instead of assuming the plan is
    // only at plan/currentPlan/workoutPlan on the first decoded object.
    for (const child of Object.values(unwrapped)) {
      if (
        child &&
        (typeof child === 'object' || typeof child === 'string')
      ) {
        visit(child, depth + 1);
      }
    }
  }

  visit(decoded);
  return candidates;
}

function activePlanForAuthorizedCandidate(candidate, auth, asOfDate) {
  const next = candidate?.nextPlan;
  const nested = unwrapStoredValue(next?.plan);
  const effectiveFrom = next?.effectiveFrom;

  if (matchesAuthIdentity(candidate, auth)) {
    if (
      isIsoDateKey(effectiveFrom) &&
      effectiveFrom <= asOfDate &&
      isUsablePlan(nested)
    ) {
      return nested;
    }
    return isUsablePlan(candidate) ? candidate : null;
  }

  if (
    isIsoDateKey(effectiveFrom) &&
    effectiveFrom <= asOfDate &&
    matchesAuthIdentity(nested, auth) &&
    isUsablePlan(nested)
  ) {
    return nested;
  }

  return null;
}

function candidateUpdatedAtMs(candidate) {
  const value = typeof candidate?.updatedAt === 'string' ? candidate.updatedAt : '';
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function newestUsableStoredPlan(values) {
  const sourceValues = Array.isArray(values) ? values : [values];
  const candidates = [];

  for (const rawValue of sourceValues) {
    const decoded = unwrapStoredValue(rawValue);
    for (const candidate of candidatePlansFromDecoded(decoded)) {
      if (!isUsablePlan(candidate)) continue;
      candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => candidateUpdatedAtMs(b) - candidateUpdatedAtMs(a));
  return candidates[0] || null;
}

export function resolveAuthorizedPlanFromValues(values, auth, asOfDate, { allowLatestFallback = false } = {}) {
  if (!auth || !isIsoDateKey(asOfDate)) return null;
  const sourceValues = Array.isArray(values) ? values : [values];

  for (const rawValue of sourceValues) {
    const decoded = unwrapStoredValue(rawValue);
    for (const candidate of candidatePlansFromDecoded(decoded)) {
      const resolved = activePlanForAuthorizedCandidate(candidate, auth, asOfDate);
      if (resolved) return resolved;
    }
  }

  if (!allowLatestFallback) return null;

  // A valid bridge HMAC is a member-scoped capability created by the save action.
  // If that exact plan version has since been replaced, let the server recover the
  // newest complete plan for the same verified member. This is needed for transitions
  // such as flexible_sequence -> fixed next week, where Pickaxe may replace the
  // top-level plan record while My Workouts still holds the immediately previous
  // signed capability in Page State.
  return newestUsableStoredPlan(sourceValues);
}

export function collectStoredValues(payload, memoryId = null) {
  const targetId = memoryId == null ? null : String(memoryId);
  const exact = [];
  const filtered = [];

  function recordMemoryId(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    for (const key of ['memoryId', 'memory_id']) {
      if (record[key]) return String(record[key]);
    }
    for (const key of ['memory', 'definition', 'memoryDefinition']) {
      const nested = record[key];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
      for (const idKey of ['memoryId', 'id', '_id']) {
        if (nested[idKey]) return String(nested[idKey]);
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
        if (targetId && id === targetId) exact.push(node[key]);
        else if (!targetId || id == null) filtered.push(node[key]);
        break;
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (!['value', 'memoryValue', 'memory_value'].includes(key)) visit(child);
    }
  }

  visit(payload);
  if (exact.length) return exact;
  if (targetId && filtered.length === 1) return filtered;
  return targetId ? [] : filtered;
}

export function normalizeMemoryName(value) {
  if (typeof value !== 'string') return null;
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function payloadItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of ['memories', 'items', 'results']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  for (const key of ['memories', 'items', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function candidateContainers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return [value, value.definition, value.memoryDefinition, value.memory].filter(
    (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
  );
}

export function memoryDefinitionName(value) {
  for (const container of candidateContainers(value)) {
    for (const key of ['memory', 'slug', 'name', 'tag', 'goal', 'title']) {
      const normalized = normalizeMemoryName(container[key]);
      if (normalized) return normalized;
    }
  }
  return null;
}

export function memoryDefinitionId(value) {
  for (const container of candidateContainers(value)) {
    for (const key of ['memoryId', 'id', '_id']) {
      if (typeof container[key] === 'string' && container[key]) return container[key];
    }
  }
  return null;
}

export function extractHistoryEntries(values) {
  for (const rawValue of Array.isArray(values) ? values : [values]) {
    const decoded = unwrapStoredValue(rawValue);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      if (Array.isArray(decoded.entries)) return decoded.entries;
    }
  }
  return [];
}
