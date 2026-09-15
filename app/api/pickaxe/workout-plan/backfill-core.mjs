import { createHmac } from 'node:crypto';

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isUsablePlan(value) {
  return !!(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.planId === 'string' && value.planId.trim() &&
    typeof value.updatedAt === 'string' && !Number.isNaN(new Date(value.updatedAt).getTime()) &&
    Array.isArray(value.weekSchedule) && value.weekSchedule.length > 0 &&
    value.workouts && typeof value.workouts === 'object' && !Array.isArray(value.workouts) &&
    Object.keys(value.workouts).length > 0
  );
}

function bridgeFor(plan, email, token) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !token) return null;
  const planId = plan.planId.trim();
  const planUpdatedAt = plan.updatedAt.trim();
  const signature = createHmac('sha256', token)
    .update(`${normalizedEmail}\n${planId}\n${planUpdatedAt}`, 'utf8')
    .digest('hex');
  return { email: normalizedEmail, planId, planUpdatedAt, signature };
}

function exactBridge(value, expected) {
  return !!(
    value && typeof value === 'object' && !Array.isArray(value) &&
    value.email === expected.email &&
    value.planId === expected.planId &&
    value.planUpdatedAt === expected.planUpdatedAt &&
    value.signature === expected.signature
  );
}

function transform(node, email, token, stats) {
  if (Array.isArray(node)) return node.map((item) => transform(item, email, token, stats));
  if (!node || typeof node !== 'object') return node;

  let result = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = transform(value, email, token, stats);
  }

  if (isUsablePlan(result)) {
    const bridge = bridgeFor(result, email, token);
    if (bridge && !exactBridge(result._historyBridge, bridge)) {
      result = { ...result, _historyBridge: bridge };
      stats.bridgesAdded += 1;
    }
  }
  return result;
}

export function backfillStoredWorkoutValue(rawValue, email, token) {
  let decoded = rawValue;
  const wasString = typeof rawValue === 'string';
  if (wasString) {
    try {
      decoded = JSON.parse(rawValue);
    } catch {
      return { changed: false, bridgesAdded: 0, value: rawValue };
    }
  }
  if (!decoded || typeof decoded !== 'object') {
    return { changed: false, bridgesAdded: 0, value: rawValue };
  }

  const stats = { bridgesAdded: 0 };
  const transformed = transform(decoded, email, token, stats);
  return {
    changed: stats.bridgesAdded > 0,
    bridgesAdded: stats.bridgesAdded,
    value: wasString ? JSON.stringify(transformed) : transformed,
  };
}
