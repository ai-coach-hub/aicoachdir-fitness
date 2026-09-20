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

test('returns the current plan while reading history for future-plan assembly', async () => {
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
  assert.equal(calls.some((call) => call.url.includes('/studio/user/')), false);
  assert.equal(calls.some((call) => call.url.includes('memoryId=mem-history')), true);
  assert.ok(calls.every((call) => call.init.headers?.get?.('Authorization') === `Bearer ${TOKEN}`));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('falls back to history memory when the plan-memory read times out', async () => {
  const { outer, auth } = plan();
  let planReadCalls = 0;
  let historyReadCalls = 0;

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      planReadCalls += 1;
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }
    if (value.includes('memoryId=mem-history')) {
      historyReadCalls += 1;
      return Response.json({ data: { items: [
        {
          memoryId: 'mem-history',
          value: JSON.stringify({ plan: outer, entries: [{ title: 'Earlier' }] }),
        },
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
  assert.deepEqual(body.entries, [{ title: 'Earlier' }]);
  assert.equal(planReadCalls, 2);
  assert.equal(historyReadCalls, 1);
});

test('returns 502 only when both plan and history recovery reads fail upstream', async () => {
  const { auth } = plan();
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan') || value.includes('memoryId=mem-history')) {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
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

  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
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


test('combines current flexible plan with a separate future fixed week from history memory', async () => {
  const currentFlexible = {
    schemaVersion: 2,
    planId: 'member-plan',
    updatedAt: '2026-09-19T10:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [
      { id: 'a', label: 'OTF Class', sequenceIndex: 0, isRestDay: false, workoutId: 'otf' },
      { id: 'b', label: 'Bodyweight Strength Basics', sequenceIndex: 1, isRestDay: false, workoutId: 'bodyweight' },
      { id: 'c', label: 'Mobility & Recovery', sequenceIndex: 2, isRestDay: false, workoutId: 'mobility' },
    ],
    workouts: {
      otf: {
        id: 'otf',
        title: 'OTF Class',
        durationMinutes: 60,
        exercises: [{ id: 'otf-e1', name: 'OTF Class', sets: 1, reps: '1 class' }],
      },
      bodyweight: {
        id: 'bodyweight',
        title: 'Bodyweight Strength Basics',
        durationMinutes: 25,
        exercises: [{ id: 'bw-e1', name: 'Push-up', sets: 3, reps: '8' }],
      },
      mobility: {
        id: 'mobility',
        title: 'Mobility & Recovery',
        durationMinutes: 20,
        exercises: [{ id: 'mob-e1', name: 'Mobility', sets: 1, reps: '8' }],
      },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: currentFlexible.planId,
    planUpdatedAt: currentFlexible.updatedAt,
  });
  currentFlexible._historyBridge = auth;

  const futureFixed = {
    schemaVersion: 2,
    planId: 'member-plan',
    updatedAt: '2026-09-19T12:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: {
      name: 'Next Week',
      weekStart: '2026-09-20',
      weekEnd: '2026-09-26',
    },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'otf' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'otf' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
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
  futureFixed._historyBridge = signAuth({
    email: 'member@example.com',
    planId: futureFixed.planId,
    planUpdatedAt: futureFixed.updatedAt,
  });

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(currentFlexible) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        {
          memoryId: 'mem-history',
          value: JSON.stringify({
            plan: futureFixed,
            entries: [{ title: 'Earlier' }],
          }),
        },
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
  assert.equal(body.plan.scheduleMode, 'flexible_sequence');
  assert.equal(body.plan.nextPlan.effectiveFrom, '2026-09-20');
  assert.equal(body.plan.nextPlan.plan.scheduleMode, 'fixed_weekdays');
  assert.equal(body.plan.nextPlan.plan.phase.weekStart, '2026-09-20');
  assert.equal(body.plan.nextPlan.plan.phase.weekEnd, '2026-09-26');
  assert.equal(body.plan.nextPlan.plan.weekSchedule.length, 7);
  assert.equal(body.plan.nextPlan.plan.weekSchedule[1].date, '2026-09-21');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[1].workoutId, 'otf');
  assert.ok(body.plan._handoffProof.workouts.some((item) => item.id === 'otf'));
});


test('uses one-pass member-memory read only after the authoritative filtered path is unavailable', async () => {
  const currentFlexible = {
    schemaVersion: 2,
    planId: 'member-plan',
    updatedAt: '2026-09-19T10:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [
      { id: 'a', label: 'OTF Class', sequenceIndex: 0, isRestDay: false, workoutId: 'otf' },
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
    planId: currentFlexible.planId,
    planUpdatedAt: currentFlexible.updatedAt,
  });
  currentFlexible._historyBridge = auth;

  const futureFixed = {
    schemaVersion: 2,
    planId: 'member-plan',
    updatedAt: '2026-09-19T12:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'otf' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'otf' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
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
  futureFixed._historyBridge = signAuth({
    email: 'member@example.com',
    planId: futureFixed.planId,
    planUpdatedAt: futureFixed.updatedAt,
  });

  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const value = String(url);
    if (
      value.includes('/studio/memory/user/member%40example.com?skip=0&take=100') &&
      !value.includes('memoryId=')
    ) {
      return Response.json({
        data: {
          items: [
            { memoryId: 'mem-plan', value: JSON.stringify(currentFlexible) },
            {
              memoryId: 'mem-history',
              value: JSON.stringify({
                plan: futureFixed,
                entries: [{ title: 'Earlier' }],
              }),
            },
          ],
        },
      });
    }
    throw new Error('unexpected fallback call');
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
  assert.equal(body.plan.scheduleMode, 'flexible_sequence');
  assert.equal(body.plan.nextPlan.effectiveFrom, '2026-09-20');
  assert.equal(body.plan.nextPlan.plan.scheduleMode, 'fixed_weekdays');
  assert.equal(body.plan.nextPlan.plan.weekSchedule.length, 7);
  assert.deepEqual(body.entries, [{ title: 'Earlier' }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes('/studio/memory/list'), true);
  assert.equal(calls[1].url.includes('/studio/memory/user/member%40example.com?skip=0&take=100'), true);
  assert.equal(calls[1].url.includes('memoryId='), false);
});


test('prefers the dedicated coach plan over a newer stale history mirror', async () => {
  const dedicated = {
    schemaVersion: 2,
    planId: 'member-plan',
    updatedAt: '2026-09-19T18:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'otf' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'otf' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
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
    planId: dedicated.planId,
    planUpdatedAt: dedicated.updatedAt,
  });
  dedicated._historyBridge = auth;

  const staleHistoryPlan = {
    ...dedicated,
    updatedAt: '2026-09-19T17:55:00.000Z',
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
    ],
    workouts: {
      ...dedicated.workouts,
      bodyweight: {
        id: 'bodyweight',
        title: 'Bodyweight Strength Basics',
        durationMinutes: 25,
        exercises: [{ id: 'bw-e1', name: 'Push-up', sets: 3, reps: '8' }],
      },
    },
  };

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(dedicated) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        {
          memoryId: 'mem-history',
          value: JSON.stringify({
            updatedAt: '2026-09-19T18:05:00.000Z',
            currentPlan: staleHistoryPlan,
            entries: [{ title: 'Earlier' }],
          }),
        },
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
  assert.equal(body.plan.weekSchedule[1].workoutId, 'otf');
  assert.equal(body.plan.weekSchedule[2].workoutId, 'otf');
  assert.equal(body.plan.weekSchedule[3].workoutId, 'otf');
  assert.equal(body.plan.weekSchedule[4].workoutId, 'otf');
  assert.equal(body.plan.weekSchedule[5].workoutId, 'otf');
  assert.deepEqual(body.entries, [{ title: 'Earlier' }]);
});


test('selects a newer corrected same-week plan from history even when it has a new plan id', async () => {
  const stale = {
    schemaVersion: 2,
    planId: 'alternating-plan',
    updatedAt: '2026-09-19T17:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
    ],
    workouts: {
      otf: {
        id: 'otf',
        title: 'OTF Class',
        durationMinutes: 60,
        exercises: [{ id: 'otf-e1', name: 'OTF Class', sets: 1, reps: '1 class' }],
      },
      bodyweight: {
        id: 'bodyweight',
        title: 'Bodyweight Strength Basics',
        durationMinutes: 25,
        exercises: [{ id: 'bw-e1', name: 'Push-up', sets: 3, reps: '8' }],
      },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: stale.planId,
    planUpdatedAt: stale.updatedAt,
  });
  stale._historyBridge = auth;

  const corrected = {
    ...stale,
    planId: 'otf-corrected-plan',
    updatedAt: '2026-09-19T18:00:00.000Z',
    weekSchedule: stale.weekSchedule.map((entry) => (
      entry.isRestDay ? entry : { ...entry, workoutId: 'otf' }
    )),
  };
  corrected._historyBridge = signAuth({
    email: 'member@example.com',
    planId: corrected.planId,
    planUpdatedAt: corrected.updatedAt,
  });

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(stale) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        {
          memoryId: 'mem-history',
          value: JSON.stringify({
            updatedAt: '2026-09-19T18:03:00.000Z',
            currentPlan: corrected,
            entries: [{ title: 'Earlier' }],
          }),
        },
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
  assert.equal(body.plan.planId, 'otf-corrected-plan');
  for (const index of [1, 2, 3, 4, 5]) {
    assert.equal(body.plan.weekSchedule[index].workoutId, 'otf');
  }
  assert.deepEqual(body.entries, [{ title: 'Earlier' }]);
});


test('repairs the exact stale Sep 20 beta plan, preserves later weeks, and persists it once', async () => {
  const currentFlexible = {
    schemaVersion: 2,
    planId: 'current-flex',
    updatedAt: '2026-09-19T16:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [
      { id: 'free-otf', label: 'OTF Class', sequenceIndex: 0, isRestDay: false, workoutId: 'otf' },
      { id: 'free-body', label: 'Bodyweight Strength Basics', sequenceIndex: 1, isRestDay: false, workoutId: 'bodyweight' },
      { id: 'free-mob', label: 'Mobility & Recovery', sequenceIndex: 2, isRestDay: false, workoutId: 'mobility' },
    ],
    workouts: {
      otf: {
        id: 'otf',
        title: 'OTF Class',
        durationMinutes: 60,
        exercises: [{ id: 'otf-e1', name: 'OTF Class', sets: 1, reps: '1 class' }],
      },
      bodyweight: {
        id: 'bodyweight',
        title: 'Bodyweight Strength Basics',
        durationMinutes: 25,
        exercises: [{ id: 'bw-e1', name: 'Push-up', sets: 3, reps: '8' }],
      },
      mobility: {
        id: 'mobility',
        title: 'Mobility & Recovery',
        durationMinutes: 20,
        exercises: [{ id: 'mob-e1', name: 'Mobility', sets: 1, reps: '8' }],
      },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: currentFlexible.planId,
    planUpdatedAt: currentFlexible.updatedAt,
  });
  currentFlexible._historyBridge = auth;

  const sep20 = {
    schemaVersion: 2,
    planId: 'stale-sep20',
    updatedAt: '2026-09-19T17:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
    ],
    workouts: JSON.parse(JSON.stringify(currentFlexible.workouts)),
  };
  sep20._historyBridge = signAuth({
    email: 'member@example.com',
    planId: sep20.planId,
    planUpdatedAt: sep20.updatedAt,
  });

  const later = {
    schemaVersion: 2,
    planId: 'later-week',
    updatedAt: '2026-09-19T17:30:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Following Week', weekStart: '2026-09-27', weekEnd: '2026-10-03' },
    weekSchedule: [
      { id: 'sun2', day: 'Sunday', date: '2026-09-27', isRestDay: true, workoutId: null },
      { id: 'mon2', day: 'Monday', date: '2026-09-28', isRestDay: false, workoutId: 'otf' },
      { id: 'tue2', day: 'Tuesday', date: '2026-09-29', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed2', day: 'Wednesday', date: '2026-09-30', isRestDay: false, workoutId: 'otf' },
      { id: 'thu2', day: 'Thursday', date: '2026-10-01', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri2', day: 'Friday', date: '2026-10-02', isRestDay: false, workoutId: 'otf' },
      { id: 'sat2', day: 'Saturday', date: '2026-10-03', isRestDay: true, workoutId: null },
    ],
    workouts: JSON.parse(JSON.stringify(currentFlexible.workouts)),
  };
  later._historyBridge = signAuth({
    email: 'member@example.com',
    planId: later.planId,
    planUpdatedAt: later.updatedAt,
  });

  sep20.nextPlan = { effectiveFrom: '2026-09-27', plan: later };
  currentFlexible.nextPlan = { effectiveFrom: '2026-09-20', plan: sep20 };

  const historyEnvelope = {
    schemaVersion: 2,
    updatedAt: currentFlexible.updatedAt,
    plan: currentFlexible,
    entries: [
      { title: 'My Workouts QA Test' },
      { title: 'Test Strength' },
    ],
  };

  const writes = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    const method = String(init.method || 'GET').toUpperCase();

    if (method === 'PATCH') {
      writes.push({
        url: value,
        body: JSON.parse(init.body),
      });
      return Response.json({ success: true });
    }
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(currentFlexible) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-history', value: JSON.stringify(historyEnvelope) },
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
  assert.equal(body.plan.scheduleMode, 'flexible_sequence');
  assert.equal(body.plan.nextPlan.effectiveFrom, '2026-09-20');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[2].workoutId, 'otf');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[4].workoutId, 'otf');
  assert.equal(body.plan.nextPlan.plan.nextPlan.effectiveFrom, '2026-09-27');
  assert.equal(body.plan.nextPlan.plan.nextPlan.plan.planId, 'later-week');

  assert.equal(writes.length, 2);
  const planWrite = writes.find((item) => item.url.endsWith('/mem-plan'));
  const historyWrite = writes.find((item) => item.url.endsWith('/mem-history'));
  assert.ok(planWrite);
  assert.ok(historyWrite);

  const storedPlan = JSON.parse(planWrite.body.data.value);
  assert.equal(storedPlan.nextPlan.plan.weekSchedule[2].workoutId, 'otf');
  assert.equal(storedPlan.nextPlan.plan.weekSchedule[4].workoutId, 'otf');
  assert.equal(storedPlan.nextPlan.plan.nextPlan.plan.planId, 'later-week');
  assert.ok(storedPlan.nextPlan.plan._historyBridge?.signature);

  const storedHistory = JSON.parse(historyWrite.body.data.value);
  assert.equal(storedHistory.plan.nextPlan.plan.weekSchedule[2].workoutId, 'otf');
  assert.deepEqual(
    storedHistory.entries.map((entry) => entry.title),
    ['My Workouts QA Test', 'Test Strength'],
  );
});


test('repairs Sep 20 beta plan when Pickaxe wraps it under arbitrary object keys', async () => {
  const currentFlexible = {
    schemaVersion: 2,
    planId: 'current-flex',
    updatedAt: '2026-09-19T16:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [
      { id: 'free-otf', label: 'OTF Class', sequenceIndex: 0, isRestDay: false, workoutId: 'otf' },
      { id: 'free-body', label: 'Bodyweight Strength Basics', sequenceIndex: 1, isRestDay: false, workoutId: 'bodyweight' },
      { id: 'free-mob', label: 'Mobility & Recovery', sequenceIndex: 2, isRestDay: false, workoutId: 'mobility' },
    ],
    workouts: {
      otf: { id: 'otf', title: 'OTF Class', durationMinutes: 60, exercises: [{ id: 'e1', name: 'OTF Class', sets: 1, reps: '1 class' }] },
      bodyweight: { id: 'bodyweight', title: 'Bodyweight Strength Basics', durationMinutes: 25, exercises: [{ id: 'e2', name: 'Push-up', sets: 3, reps: '8' }] },
      mobility: { id: 'mobility', title: 'Mobility & Recovery', durationMinutes: 20, exercises: [{ id: 'e3', name: 'Mobility', sets: 1, reps: '8' }] },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: currentFlexible.planId,
    planUpdatedAt: currentFlexible.updatedAt,
  });
  currentFlexible._historyBridge = auth;

  const sep20 = {
    schemaVersion: 2,
    planId: 'stale-sep20',
    updatedAt: '2026-09-19T17:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
    ],
    workouts: JSON.parse(JSON.stringify(currentFlexible.workouts)),
  };
  sep20._historyBridge = signAuth({
    email: 'member@example.com',
    planId: sep20.planId,
    planUpdatedAt: sep20.updatedAt,
  });

  const later = {
    ...sep20,
    planId: 'later',
    updatedAt: '2026-09-19T18:00:00.000Z',
    phase: { name: 'Following Week', weekStart: '2026-09-27', weekEnd: '2026-10-03' },
    weekSchedule: sep20.weekSchedule.map((entry, index) => ({
      ...entry,
      date: ['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03'][index],
    })),
  };
  later._historyBridge = signAuth({
    email: 'member@example.com',
    planId: later.planId,
    planUpdatedAt: later.updatedAt,
  });

  sep20.nextPlan = { effectiveFrom: '2026-09-27', plan: later };
  currentFlexible.nextPlan = { effectiveFrom: '2026-09-20', plan: sep20 };

  const wrappedStoredValue = {
    data: {
      result: {
        record: {
          payload: {
            unexpectedWrapperName: currentFlexible,
          },
        },
      },
    },
  };

  const historyEnvelope = {
    schemaVersion: 2,
    updatedAt: currentFlexible.updatedAt,
    plan: currentFlexible,
    entries: [{ title: 'My Workouts QA Test' }, { title: 'Test Strength' }],
  };

  const writes = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'PATCH') {
      writes.push({ url: value, body: JSON.parse(init.body) });
      return Response.json({ success: true });
    }
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-plan', value: JSON.stringify(wrappedStoredValue) },
      ] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-history', value: JSON.stringify(historyEnvelope) },
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
  assert.equal(writes.length, 2);

  const planWrite = writes.find((item) => item.url.endsWith('/mem-plan'));
  const stored = JSON.parse(planWrite.body.data.value);
  const corrected = stored.data.result.record.payload.unexpectedWrapperName.nextPlan.plan;
  assert.equal(corrected.weekSchedule[2].workoutId, 'otf');
  assert.equal(corrected.weekSchedule[4].workoutId, 'otf');
  assert.equal(corrected.nextPlan.plan.planId, 'later');
});


test('repairs the stale Sep 20 plan when it exists only in history memory', async () => {
  const currentFlexible = {
    schemaVersion: 2,
    planId: 'current-flex',
    updatedAt: '2026-09-19T16:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [
      { id: 'free-otf', label: 'OTF Class', sequenceIndex: 0, isRestDay: false, workoutId: 'otf' },
      { id: 'free-body', label: 'Bodyweight Strength Basics', sequenceIndex: 1, isRestDay: false, workoutId: 'bodyweight' },
      { id: 'free-mob', label: 'Mobility & Recovery', sequenceIndex: 2, isRestDay: false, workoutId: 'mobility' },
    ],
    workouts: {
      otf: { id: 'otf', title: 'OTF Class', durationMinutes: 60, exercises: [{ id: 'e1', name: 'OTF Class', sets: 1, reps: '1 class' }] },
      bodyweight: { id: 'bodyweight', title: 'Bodyweight Strength Basics', durationMinutes: 25, exercises: [{ id: 'e2', name: 'Push-up', sets: 3, reps: '8' }] },
      mobility: { id: 'mobility', title: 'Mobility & Recovery', durationMinutes: 20, exercises: [{ id: 'e3', name: 'Mobility', sets: 1, reps: '8' }] },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: currentFlexible.planId,
    planUpdatedAt: currentFlexible.updatedAt,
  });
  currentFlexible._historyBridge = auth;

  const sep20 = {
    schemaVersion: 2,
    planId: 'stale-sep20',
    updatedAt: '2026-09-19T17:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
    ],
    workouts: JSON.parse(JSON.stringify(currentFlexible.workouts)),
  };
  sep20._historyBridge = signAuth({
    email: 'member@example.com',
    planId: sep20.planId,
    planUpdatedAt: sep20.updatedAt,
  });

  const later = {
    ...sep20,
    planId: 'later',
    updatedAt: '2026-09-19T18:00:00.000Z',
    phase: { name: 'Following Week', weekStart: '2026-09-27', weekEnd: '2026-10-03' },
    weekSchedule: sep20.weekSchedule.map((entry, index) => ({
      ...entry,
      date: ['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03'][index],
    })),
  };
  later._historyBridge = signAuth({
    email: 'member@example.com',
    planId: later.planId,
    planUpdatedAt: later.updatedAt,
  });

  sep20.nextPlan = { effectiveFrom: '2026-09-27', plan: later };
  currentFlexible.nextPlan = { effectiveFrom: '2026-09-20', plan: sep20 };

  const historyEnvelope = {
    schemaVersion: 2,
    updatedAt: currentFlexible.updatedAt,
    plan: currentFlexible,
    entries: [{ title: 'My Workouts QA Test' }, { title: 'Test Strength' }],
  };

  const writes = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    const method = String(init.method || 'GET').toUpperCase();

    if (method === 'PATCH') {
      writes.push({ url: value, body: JSON.parse(init.body) });
      return Response.json({ success: true });
    }
    if (value.includes('/studio/memory/list')) {
      return Response.json({ data: { items: [
        { id: 'mem-plan', name: 'fitness-workout-plan-v1' },
        { id: 'mem-history', name: 'fitness-workout-history-v1' },
      ] } });
    }
    if (value.includes('memoryId=mem-plan')) {
      return Response.json({ data: { items: [] } });
    }
    if (value.includes('memoryId=mem-history')) {
      return Response.json({ data: { items: [
        { memoryId: 'mem-history', value: JSON.stringify(historyEnvelope) },
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
  assert.equal(writes.length, 1);
  assert.ok(writes[0].url.endsWith('/mem-history'));

  const repairedHistory = JSON.parse(writes[0].body.data.value);
  const corrected = repairedHistory.plan.nextPlan.plan;
  assert.equal(corrected.weekSchedule[2].workoutId, 'otf');
  assert.equal(corrected.weekSchedule[4].workoutId, 'otf');
  assert.equal(corrected.nextPlan.plan.planId, 'later');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[2].workoutId, 'otf');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[4].workoutId, 'otf');
});


test('repairs the stale Sep 20 beta plan when it is served from cache', async () => {
  const currentFlexible = {
    schemaVersion: 2,
    planId: 'current-flex-cache',
    updatedAt: '2026-09-19T16:00:00.000Z',
    scheduleMode: 'flexible_sequence',
    selectionMode: 'free_choice',
    weekSchedule: [
      { id: 'free-otf', label: 'OTF Class', sequenceIndex: 0, isRestDay: false, workoutId: 'otf' },
      { id: 'free-body', label: 'Bodyweight Strength Basics', sequenceIndex: 1, isRestDay: false, workoutId: 'bodyweight' },
      { id: 'free-mob', label: 'Mobility & Recovery', sequenceIndex: 2, isRestDay: false, workoutId: 'mobility' },
    ],
    workouts: {
      otf: { id: 'otf', title: 'OTF Class', durationMinutes: 60, exercises: [{ id: 'e1', name: 'OTF Class', sets: 1, reps: '1 class' }] },
      bodyweight: { id: 'bodyweight', title: 'Bodyweight Strength Basics', durationMinutes: 25, exercises: [{ id: 'e2', name: 'Push-up', sets: 3, reps: '8' }] },
      mobility: { id: 'mobility', title: 'Mobility & Recovery', durationMinutes: 20, exercises: [{ id: 'e3', name: 'Mobility', sets: 1, reps: '8' }] },
    },
  };
  const auth = signAuth({
    email: 'member@example.com',
    planId: currentFlexible.planId,
    planUpdatedAt: currentFlexible.updatedAt,
  });
  currentFlexible._historyBridge = auth;

  const sep20 = {
    schemaVersion: 2,
    planId: 'stale-sep20-cache',
    updatedAt: '2026-09-19T17:00:00.000Z',
    scheduleMode: 'fixed_weekdays',
    phase: { name: 'Next Week', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    weekSchedule: [
      { id: 'sun', day: 'Sunday', date: '2026-09-20', isRestDay: true, workoutId: null },
      { id: 'mon', day: 'Monday', date: '2026-09-21', isRestDay: false, workoutId: 'otf' },
      { id: 'tue', day: 'Tuesday', date: '2026-09-22', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'wed', day: 'Wednesday', date: '2026-09-23', isRestDay: false, workoutId: 'otf' },
      { id: 'thu', day: 'Thursday', date: '2026-09-24', isRestDay: false, workoutId: 'bodyweight' },
      { id: 'fri', day: 'Friday', date: '2026-09-25', isRestDay: false, workoutId: 'otf' },
      { id: 'sat', day: 'Saturday', date: '2026-09-26', isRestDay: true, workoutId: null },
    ],
    workouts: JSON.parse(JSON.stringify(currentFlexible.workouts)),
  };
  sep20._historyBridge = signAuth({
    email: 'member@example.com',
    planId: sep20.planId,
    planUpdatedAt: sep20.updatedAt,
  });

  const later = {
    ...sep20,
    planId: 'later-cache',
    updatedAt: '2026-09-19T18:00:00.000Z',
    phase: { name: 'Following Week', weekStart: '2026-09-27', weekEnd: '2026-10-03' },
    weekSchedule: sep20.weekSchedule.map((entry, index) => ({
      ...entry,
      date: ['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03'][index],
    })),
  };
  later._historyBridge = signAuth({
    email: 'member@example.com',
    planId: later.planId,
    planUpdatedAt: later.updatedAt,
  });

  sep20.nextPlan = { effectiveFrom: '2026-09-27', plan: later };
  currentFlexible.nextPlan = { effectiveFrom: '2026-09-20', plan: sep20 };

  const cacheWrites = [];
  let fetchCalls = 0;
  const response = await routeCore.handleWorkoutPlanRead({
    request: requestFor({ auth, asOfDate: '2026-09-19' }),
    token: TOKEN,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('cache hit should not call Pickaxe');
    },
    allowedOrigins: new Set([ORIGIN]),
    cacheRead: async () => ({
      plan: currentFlexible,
      entries: [{ title: 'Earlier' }],
    }),
    cacheWrite: async (email, planValue, entries) => {
      cacheWrites.push({ email, plan: planValue, entries });
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(fetchCalls, 0);
  assert.equal(body.plan.nextPlan.effectiveFrom, '2026-09-20');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[2].workoutId, 'otf');
  assert.equal(body.plan.nextPlan.plan.weekSchedule[4].workoutId, 'otf');
  assert.equal(body.plan.nextPlan.plan.nextPlan.plan.planId, 'later-cache');
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0].email, 'member@example.com');
  assert.equal(cacheWrites[0].plan.nextPlan.plan.weekSchedule[2].workoutId, 'otf');
  assert.equal(cacheWrites[0].plan.nextPlan.plan.weekSchedule[4].workoutId, 'otf');
});
