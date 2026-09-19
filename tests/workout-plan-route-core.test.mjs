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
  assert.ok(body.plan._handoffProof);
  assert.equal(body.plan._handoffProof.email, 'member@example.com');
  assert.ok(body.plan._handoffProof.workouts.some((item) => item.id === 'lower'));
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


test('retries a transient Pickaxe memory-definition failure and still loads the plan', async () => {
  const { outer, auth } = plan();
  let definitionCalls = 0;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/user/member%40example.com')) {
      return Response.json({ data: { email: 'member@example.com' } });
    }
    if (value.includes('/studio/memory/list')) {
      definitionCalls += 1;
      if (definitionCalls === 1) return new Response('temporary', { status: 503 });
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(outer) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [] } });
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
  assert.equal(definitionCalls, 2);
});


test('uses a valid stale capability to recover the newest member plan and signs handoff proof for that newest plan', async () => {
  const oldPlan = {
    schemaVersion: 2,
    planId: 'old-flex',
    updatedAt: '2026-09-18T10:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [{ id: 'a', label: 'Workout A', sequenceIndex: 0, isRestDay: false, workoutId: 'old-a' }],
    workouts: {
      'old-a': {
        id: 'old-a',
        title: 'Old A',
        durationMinutes: 30,
        exercises: [{ id: 'old-e1', name: 'Old Exercise', sets: 2, reps: '8' }],
      },
    },
  };
  const staleAuth = signAuth({
    email: 'member@example.com',
    planId: oldPlan.planId,
    planUpdatedAt: oldPlan.updatedAt,
  });

  const newestPlan = {
    schemaVersion: 2,
    planId: 'next-fixed',
    updatedAt: '2026-09-19T12:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
    ],
    workouts: {
      otf: {
        id: 'otf',
        title: 'OTF Class',
        durationMinutes: 60,
        exercises: [{ id: 'otf-e1', name: 'OTF Class', sets: 1, reps: '1 class' }],
      },
    },
  };
  newestPlan._historyBridge = signAuth({
    email: 'member@example.com',
    planId: newestPlan.planId,
    planUpdatedAt: newestPlan.updatedAt,
  });

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/user/member%40example.com')) {
      return Response.json({ data: { email: 'member@example.com' } });
    }
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(newestPlan) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [] } });
    }
    return new Response('not found', { status: 404 });
  };

  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth: staleAuth, asOfDate: '2026-09-19' }),
    token: TOKEN,
    fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.plan.planId, 'next-fixed');
  assert.equal(body.plan._handoffProof.planId, 'next-fixed');
  assert.equal(body.plan._handoffProof.planUpdatedAt, '2026-09-19T12:00:00.000Z');
  assert.ok(body.plan._handoffProof.workouts.some((item) => item.id === 'otf'));
});


test('recovers plan from full Pickaxe payload when generic value field is misleading', async () => {
  const newestPlan = {
    schemaVersion: 2,
    planId: 'next-fixed',
    updatedAt: '2026-09-19T12:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
    ],
    workouts: {
      otf: {
        id: 'otf',
        title: 'OTF Class',
        durationMinutes: 60,
        exercises: [{ id: 'otf-e1', name: 'OTF Class', sets: 1, reps: '1 class' }],
      },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: 'old-flex',
    planUpdatedAt: '2026-09-18T10:00:00.000Z',
  });
  newestPlan._historyBridge = signAuth({
    email: 'member@example.com',
    planId: newestPlan.planId,
    planUpdatedAt: newestPlan.updatedAt,
  });

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/user/member%40example.com')) {
      return Response.json({ data: { email: 'member@example.com' } });
    }
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({
        data: {
          items: [{
            memoryId: 'mem-plan',
            value: 'not-the-plan',
            record: {
              payload: {
                currentPlan: JSON.stringify(newestPlan),
              },
            },
          }],
        },
      });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [] } });
    }
    return new Response('not found', { status: 404 });
  };

  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth, asOfDate: '2026-09-19' }),
    token: TOKEN,
    fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.plan.planId, 'next-fixed');
});

test('accepts a flexible plan whose schedule is present only in flexibleSequence', async () => {
  const flexible = {
    schemaVersion: 2,
    planId: 'flex-only',
    updatedAt: '2026-09-19T12:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    flexibleSequence: [
      { id: 'a', label: 'Workout A', sequenceIndex: 0, isRestDay: false, workoutId: 'a' },
    ],
    workouts: {
      a: {
        id: 'a',
        title: 'Workout A',
        durationMinutes: 30,
        exercises: [{ id: 'e1', name: 'Exercise', sets: 2, reps: '8' }],
      },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: flexible.planId,
    planUpdatedAt: flexible.updatedAt,
  });

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/user/member%40example.com')) {
      return Response.json({ data: { email: 'member@example.com' } });
    }
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(flexible) },
      ] } });
    }
    return new Response('not found', { status: 404 });
  };

  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth, asOfDate: '2026-09-19' }),
    token: TOKEN,
    fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.plan.planId, 'flex-only');
});
