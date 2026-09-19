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


function stripCodeFence(text) {
  const trimmed = String(text || '').trim();
  const fence = String.fromCharCode(96, 96, 96);
  if (!trimmed.startsWith(fence)) return trimmed;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length && lines[0].trim().startsWith(fence)) lines.shift();
  if (lines.length && lines[lines.length - 1].trim() === fence) lines.pop();
  return lines.join('\n').trim();
}

function extractStructuredSlice(text) {
  const source = String(text || '');
  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  let start = -1;
  let open = null;
  let close = null;

  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
    open = '{';
    close = '}';
  } else if (arrayStart >= 0) {
    start = arrayStart;
    open = '[';
    close = ']';
  }
  if (start < 0) return source.trim();

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).trim();
    }
  }
  return source.slice(start).trim();
}

function pythonLiteralToJson(text) {
  const source = String(text || '');
  let result = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === "'") {
      index += 1;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const current = source[index];
        if (current === '\\' && index + 1 < source.length) {
          const next = source[index + 1];
          const escapes = {
            n: '\n',
            r: '\r',
            t: '\t',
            b: '\b',
            f: '\f',
            "'": "'",
            '"': '"',
            '\\': '\\',
          };
          value += Object.prototype.hasOwnProperty.call(escapes, next)
            ? escapes[next]
            : next;
          index += 2;
          continue;
        }
        if (current === "'") {
          closed = true;
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      if (!closed) return null;
      result += JSON.stringify(value);
      continue;
    }

    if (char === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        if (escaped) {
          escaped = false;
          index += 1;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          index += 1;
          continue;
        }
        index += 1;
        if (current === '"') break;
      }
      result += source.slice(start, index);
      continue;
    }

    const remainder = source.slice(index);
    const token = remainder.match(/^(True|False|None)\b/);
    if (token) {
      result += token[1] === 'True' ? 'true' : token[1] === 'False' ? 'false' : 'null';
      index += token[1].length;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}


function removeTrailingCommas(text) {
  const source = String(text || '');
  let result = '';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      continue;
    }
    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;
      if (source[lookahead] === '}' || source[lookahead] === ']') continue;
    }
    result += char;
  }
  return result;
}

function decodeEscapedJsonLayer(text) {
  const source = String(text || '').trim();
  if (!(source.startsWith('{\\"') || source.startsWith('[\\"') || source.includes('\\"schemaVersion\\"'))) {
    return null;
  }
  try {
    const wrapped = '"' + source.replace(/"/g, '\\"') + '"';
    const decoded = JSON.parse(wrapped);
    return typeof decoded === 'string' ? decoded : null;
  } catch {
    return null;
  }
}

function decodeUrlEncodedLayer(text) {
  const source = String(text || '').trim();
  if (!/%(?:7B|7D|5B|5D|22|27)/i.test(source)) return null;
  try {
    const decoded = decodeURIComponent(source);
    return decoded !== source ? decoded : null;
  } catch {
    return null;
  }
}

function decodeStoredText(value) {
  if (typeof value !== 'string') return value;

  let current = value.replace(/^\uFEFF/, '').trim();
  for (let depth = 0; depth < 8 && typeof current === 'string'; depth += 1) {
    const normalized = stripCodeFence(current);
    const htmlDecoded = normalized
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');

    const escapedDecoded = decodeEscapedJsonLayer(htmlDecoded);
    const urlDecoded = decodeUrlEncodedLayer(htmlDecoded);

    const candidates = [];
    for (const candidate of [
      normalized,
      htmlDecoded,
      escapedDecoded,
      urlDecoded,
      extractStructuredSlice(normalized),
      extractStructuredSlice(htmlDecoded),
      escapedDecoded ? extractStructuredSlice(escapedDecoded) : null,
      urlDecoded ? extractStructuredSlice(urlDecoded) : null,
    ]) {
      if (!candidate) continue;
      for (const variant of [candidate, removeTrailingCommas(candidate)]) {
        if (variant && !candidates.includes(variant)) candidates.push(variant);
      }
    }

    let parsed = null;
    let found = false;
    for (const candidate of candidates) {
      try {
        parsed = JSON.parse(candidate);
        found = true;
        break;
      } catch {
        const pythonJson = pythonLiteralToJson(candidate);
        if (!pythonJson) continue;
        try {
          parsed = JSON.parse(pythonJson);
          found = true;
          break;
        } catch {
          // Try the next safe representation.
        }
      }
    }

    if (!found) return current;
    current = parsed;
  }
  return current;
}

export function unwrapStoredValue(value) {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === 'string') {
      const decoded = decodeStoredText(current);
      if (decoded === current) return current;
      current = decoded;
      continue;
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const schedule =
    Array.isArray(value.weekSchedule) && value.weekSchedule.length > 0
      ? value.weekSchedule
      : Array.isArray(value.flexibleSequence) && value.flexibleSequence.length > 0
        ? value.flexibleSequence
        : null;
  return !!(
    schedule &&
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
    if (depth > 12 || value == null) return;

    if (typeof value === 'string') {
      const parsed = decodeStoredText(value);
      if (parsed !== value) visit(parsed, depth + 1);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    if (isUsablePlan(value)) candidates.push(value);

    // Never collapse an object to its generic `value` field before walking
    // sibling properties. Pickaxe can return metadata/value wrappers alongside
    // the actual plan envelope, so every child must remain discoverable.
    for (const child of Object.values(value)) {
      if (child != null && (typeof child === 'object' || typeof child === 'string')) {
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
    for (const candidate of candidatePlansFromDecoded(rawValue)) {
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
    for (const candidate of candidatePlansFromDecoded(rawValue)) {
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

function planStartDate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const phaseStart = candidate?.phase?.weekStart;
  if (isIsoDateKey(phaseStart)) return phaseStart;

  const dates = Array.isArray(candidate.weekSchedule)
    ? candidate.weekSchedule
        .map((entry) => (isIsoDateKey(entry?.date) ? entry.date : null))
        .filter(Boolean)
        .sort()
    : [];
  return dates[0] || null;
}

function samePlanVersion(a, b) {
  if (!a || !b) return false;
  return (
    String(a.planId || '') === String(b.planId || '') &&
    String(a.updatedAt || '') === String(b.updatedAt || '')
  );
}

function allUsablePlanCandidates(values) {
  const sourceValues = Array.isArray(values) ? values : [values];
  const candidates = [];
  const seenVersions = new Set();

  for (const rawValue of sourceValues) {
    for (const candidate of candidatePlansFromDecoded(rawValue)) {
      if (!isUsablePlan(candidate)) continue;
      const key = `${String(candidate.planId || '')}\n${String(candidate.updatedAt || '')}\n${planStartDate(candidate) || ''}`;
      if (seenVersions.has(key)) continue;
      seenVersions.add(key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function resolveAuthorizedPlanWindowFromValues(
  values,
  auth,
  asOfDate,
  { allowLatestFallback = false } = {},
) {
  const current = resolveAuthorizedPlanFromValues(
    values,
    auth,
    asOfDate,
    { allowLatestFallback },
  );
  if (!current) return null;

  const existingNext = current?.nextPlan;
  const existingNextPlan = unwrapStoredValue(existingNext?.plan);
  if (
    isIsoDateKey(existingNext?.effectiveFrom) &&
    existingNext.effectiveFrom > asOfDate &&
    isUsablePlan(existingNextPlan)
  ) {
    return current;
  }

  const futureCandidates = allUsablePlanCandidates(values)
    .map((candidate) => ({ candidate, start: planStartDate(candidate) }))
    .filter(({ candidate, start }) => (
      start &&
      start > asOfDate &&
      !samePlanVersion(candidate, current)
    ))
    .sort((a, b) => {
      const byStart = a.start.localeCompare(b.start);
      if (byStart !== 0) return byStart;
      return candidateUpdatedAtMs(b.candidate) - candidateUpdatedAtMs(a.candidate);
    });

  const future = futureCandidates[0];
  if (!future) return current;

  const stagedFuture = { ...future.candidate };
  delete stagedFuture.nextPlan;

  return {
    ...current,
    nextPlan: {
      effectiveFrom: future.start,
      plan: stagedFuture,
    },
  };
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
