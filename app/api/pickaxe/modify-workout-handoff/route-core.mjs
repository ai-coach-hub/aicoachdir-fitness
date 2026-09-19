import { parseBridgeAuth, verifyBridgeAuth } from '../workout-plan/bridge-core.mjs';
import {
  buildHandoffSessionId,
  buildTriggerMessage,
  handoffKey,
  parseModifyHandoffRequest,
  resolveWorkout,
} from './core.mjs';

const PICKAXE_API_BASE = 'https://api.pickaxe.co/v1';
const MAX_BODY_BYTES = 16 * 1024;

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

async function readJsonBody(request) {
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function workspaceUserId(fetchImpl, token, email) {
  const response = await fetchImpl(
    `${PICKAXE_API_BASE}/studio/user/${encodeURIComponent(email)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
    },
  );
  if (!response.ok) return '';
  const payload = await response.json().catch(() => null);
  const user = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  return typeof user?.userId === 'string' ? user.userId.trim() : '';
}

async function triggerCoach(fetchImpl, deploymentId, message, memberUserId, sessionId) {
  return fetchImpl(`${PICKAXE_API_BASE}/triggers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deploymentId}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      message,
      userId: memberUserId,
      conversationId: sessionId,
      stream: false,
    }),
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined,
  });
}

export async function handleModifyWorkoutHandoff({
  request,
  workspaceToken,
  deploymentId,
  fetchImpl = fetch,
  allowedOrigins = new Set(['https://studio.pickaxe.co']),
  readPlan,
  claimHandoff,
  markSucceeded,
  markFailed,
}) {
  const origin = request.headers.get('origin')?.trim() || '';
  if (!origin || !allowedOrigins.has(origin)) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Origin not allowed.' }, 403);
  }
  if (!workspaceToken || !deploymentId) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Coach handoff is not configured.' }, 503);
  }

  let raw;
  try { raw = await readJsonBody(request); } catch { raw = null; }
  const input = parseModifyHandoffRequest(raw);
  if (!input) return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Invalid request.' }, 400);

  const auth = parseBridgeAuth(input.historyBridge);
  if (!auth || !verifyBridgeAuth(auth, workspaceToken)) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Workout handoff authorization failed.' }, 401);
  }

  let plan;
  try {
    plan = await readPlan(workspaceToken, auth);
  } catch {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Workout plan could not be verified.' }, 502);
  }
  if (!plan || plan.planId !== auth.planId || plan.updatedAt !== auth.planUpdatedAt) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Your saved workout plan has changed. Refresh My Workouts and try again.' }, 409);
  }

  const workout = resolveWorkout(plan, input.workoutId);
  if (!workout) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'That workout is no longer in the saved plan.' }, 404);
  }

  let memberUserId;
  try {
    memberUserId = await workspaceUserId(fetchImpl, workspaceToken, auth.email);
  } catch {
    memberUserId = '';
  }
  if (!memberUserId) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Coach session could not be verified.' }, 502);
  }

  const sessionId = buildHandoffSessionId(input.requestId);
  if (!sessionId) {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Coach handoff could not be started.' }, 400);
  }

  const key = handoffKey(auth.email, sessionId, auth.planUpdatedAt, workout.id);
  let claim;
  try {
    claim = await claimHandoff(key, auth.email, sessionId, workout.id, auth.planUpdatedAt);
  } catch {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'Coach handoff could not be started.' }, 502);
  }
  if (claim === 'succeeded') {
    return jsonResponse(origin, allowedOrigins, { ok: true, reused: true, sessionId }, 200);
  }
  if (claim === 'processing') {
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'This workout is already being opened with your coach.' }, 409);
  }

  try {
    const triggerResponse = await triggerCoach(
      fetchImpl,
      deploymentId,
      buildTriggerMessage(workout),
      memberUserId,
      sessionId,
    );
    const triggerPayload = await triggerResponse.json().catch(() => null);
    if (!triggerResponse.ok || triggerPayload?.success !== true) {
      await markFailed(key);
      return jsonResponse(origin, allowedOrigins, { ok: false, message: 'We could not open this workout with your coach.' }, 502);
    }
    await markSucceeded(key);
    return jsonResponse(origin, allowedOrigins, { ok: true, sessionId }, 200);
  } catch {
    try { await markFailed(key); } catch {}
    return jsonResponse(origin, allowedOrigins, { ok: false, message: 'We could not open this workout with your coach.' }, 502);
  }
}

export function buildHandoffCorsHeaders(origin, allowedOrigins) {
  return corsHeaders(origin, allowedOrigins);
}
