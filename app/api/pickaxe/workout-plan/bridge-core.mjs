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
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return [];
  const candidates = [];
  for (const candidate of [decoded.plan, decoded.currentPlan, decoded.workoutPlan, decoded]) {
    const unwrapped = unwrapStoredValue(candidate);
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      candidates.push(unwrapped);
    }
  }
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

export function resolveAuthorizedPlanFromValues(values, auth, asOfDate) {
  if (!auth || !isIsoDateKey(asOfDate)) return null;
  const sourceValues = Array.isArray(values) ? values : [values];

  for (const rawValue of sourceValues) {
    const decoded = unwrapStoredValue(rawValue);
    for (const candidate of candidatePlansFromDecoded(decoded)) {
      const resolved = activePlanForAuthorizedCandidate(candidate, auth, asOfDate);
      if (resolved) return resolved;
    }
  }

  return null;
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
