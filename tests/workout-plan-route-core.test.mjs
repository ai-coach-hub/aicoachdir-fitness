import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const routeCore = await import('../app/api/pickaxe/workout-plan/route-core.mjs');

const TOKEN = 'test-workspace-secret';
const ORIGIN = 'https://studio.pickaxe.co';

function signAuth({ email, planId, planUpdatedAt }) {
  const normalizedEmail = email.toLowerCase();
  const signature = createHmac('sha256', TOKEN)
    .update(`${normalizedEmail}\n${planId}\n${planUpdatedAt}`, 'utf8')
    .digest('hex');
  return { email: normalizedEmail, planId, planUpdatedAt, signature };
}

function plan() {
  const nested = {
    schemaVersion: 2,
    planId: 'sep13',
    updatedAt: '2026-09-09T11:43:37.500Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Current Week', weekStart: '2026-09-13' },
    weekSchedule: [{ id: 'mon', day: 'Monday', isRestDay: false, workoutId: 'lower' }],
    workouts: {
      lower: {
        id: 'lower',
        title: 'Lower-Body + Core Strength',
        durationMinutes: 45,
        exercises: [{ id: 'e1', name: 'Pistol Squat', sets: 4, reps: '5-8' }],
      },
    },
  };
  const outer = {
    schemaVersion: 2,
    planId: 'sep06',
    updatedAt: '2026-09-09T11:43:37.486Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Previous Week', weekStart: '2026-09-06' },
    weekSchedule: [{ id: 'mon-old', day: 'Monday', isRestDay: true, workoutId: null }],
    workouts: {
      old: {
        id: 'old',
        title: 'Old',
        durationMinutes: 30,
        exercises: [{ id: 'old-e1', name: 'Old Exercise', sets: 2, reps: '8' }],
      },
    },
    nextPlan: { effectiveFrom: '2026-09-13', plan: nested },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: outer.planId,
    planUpdatedAt: outer.updatedAt,
  });
  outer._historyBridge = auth;
  nested._historyBridge = signAuth({
    email: 'member@example.com',
    planId: nested.planId,
    planUpdatedAt: nested.updatedAt,
  });
  return { outer, auth };
}

function requestFor(body, origin = ORIGIN) {
  return new Request('https://aicoachdir.com/api/pickaxe/workout-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

test('rejects invalid signatures before any Pickaxe API call', async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error('should not fetch');
  };
  const { auth } = plan();
  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth: { ...auth, signature: '0'.repeat(64) }, asOfDate: '2026-09-14' }),
    token: TOKEN,
    fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  assert.equal(response.status, 401);
  assert.equal(fetchCalls, 0);
});

test('reads only the verified member plan and returns the effective nested plan', async () => {
  const { outer, auth } = plan();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/studio/user/member%40example.com')) {
      return Response.json({ data: { email: 'member@example.com' } });
    }
    if (String(url).includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (String(url).includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(outer) },
      ] } });
    }
    if (String(url).includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-history', value: JSON.stringify({ plan: outer, entries: [{ title: 'Earlier' }] }) },
      ] } });
    }
    return new Response('not found', { status: 404 });
  };

  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth, asOfDate: '2026-09-14' }),
    token: TOKEN,
    fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.plan.planId, 'sep13');
  assert.equal(body.plan.workouts.lower.title, 'Lower-Body + Core Strength');
  assert.deepEqual(body.entries, [{ title: 'Earlier' }]);
  assert.ok(calls.every((call) => call.init.headers?.get?.('Authorization') === `Bearer ${TOKEN}`));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('does not allow an unapproved browser origin', async () => {
  const { auth } = plan();
  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth, asOfDate: '2026-09-14' }, 'https://evil.example'),
    token: TOKEN,
    fetchImpl: async () => Response.json({}),
    allowedOrigins: new Set([ORIGIN]),
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
