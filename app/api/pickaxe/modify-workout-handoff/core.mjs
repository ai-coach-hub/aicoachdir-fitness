import { createHash } from 'node:crypto';

export const FITNESS_COACH_ID = 'W7S4B963AI9ELAW';

function cleanString(value, max) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) return '';
  return cleaned;
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function parseModifyHandoffRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const workoutId = cleanString(value.workoutId, 200);
  const planId = cleanString(value.planId, 200);
  const planUpdatedAt = cleanString(value.planUpdatedAt, 100);
  const sessionId = cleanString(value.sessionId, 300);
  const historyBridge = value.historyBridge;
  if (!historyBridge || typeof historyBridge !== 'object' || Array.isArray(historyBridge)) return null;
  const email = normalizeEmail(historyBridge.email);
  const bridgePlanId = cleanString(historyBridge.planId, 200);
  const bridgeUpdatedAt = cleanString(historyBridge.planUpdatedAt, 100);
  const signature = cleanString(historyBridge.signature, 128).toLowerCase();
  if (!workoutId || !planId || !sessionId || !email || !bridgePlanId || !bridgeUpdatedAt) return null;
  if (Number.isNaN(new Date(planUpdatedAt).getTime()) || Number.isNaN(new Date(bridgeUpdatedAt).getTime())) return null;
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  if (planId !== bridgePlanId || planUpdatedAt !== bridgeUpdatedAt) return null;
  return {
    workoutId,
    planId,
    planUpdatedAt,
    sessionId,
    historyBridge: { email, planId: bridgePlanId, planUpdatedAt: bridgeUpdatedAt, signature },
  };
}

function historyRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object' && Array.isArray(payload.data.items)) return payload.data.items;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export function findVerifiedSession(payload, sessionId, email) {
  const normalized = normalizeEmail(email);
  return historyRows(payload).find((row) =>
    row && typeof row === 'object' &&
    String(row.responseId || '') === sessionId &&
    String(row.formId || '') === FITNESS_COACH_ID &&
    normalizeEmail(row.userId) === normalized
  ) || null;
}

export function resolveWorkout(plan, workoutId) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const workouts = plan.workouts;
  if (!workouts || typeof workouts !== 'object' || Array.isArray(workouts)) return null;
  const workout = workouts[workoutId];
  if (!workout || typeof workout !== 'object' || Array.isArray(workout)) return null;
  const id = cleanString(workout.id, 200) || workoutId;
  const title = cleanString(workout.title, 200) || cleanString(workout.name, 200);
  if (!title) return null;
  return { id, title };
}

export function buildTriggerMessage(workout) {
  return [
    `The member clicked Modify This Workout for the saved workout "${workout.title}" (workout ID: ${workout.id}).`,
    'Retrieve the newest saved My Workouts plan using Get Workout Plan before making any changes.',
    `Treat "${workout.title}" as the workout the member wants to modify.`,
    'Ask the member one concise question about what they want to change.',
    'Do not save or alter the plan until the member provides the requested change.',
    'Preserve all unrelated workouts and plan details.',
  ].join(' ');
}

export function handoffKey(email, sessionId, planUpdatedAt, workoutId) {
  return createHash('sha256')
    .update(`${normalizeEmail(email)}\n${sessionId}\n${planUpdatedAt}\n${workoutId}`, 'utf8')
    .digest('hex');
}
