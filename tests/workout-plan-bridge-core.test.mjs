import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const bridge = await import('../app/api/pickaxe/workout-plan/bridge-core.mjs');

const TOKEN = 'test-workspace-secret';

function sign({ email, planId, planUpdatedAt }) {
  const normalizedEmail = email.trim().toLowerCase();
  const message = `${normalizedEmail}\n${planId}\n${planUpdatedAt}`;
  return createHmac('sha256', TOKEN).update(message, 'utf8').digest('hex');
}

function authFor(plan, email = 'member@example.com') {
  const auth = {
    email,
    planId: plan.planId,
    planUpdatedAt: plan.updatedAt,
  };
  return { ...auth, signature: sign(auth) };
}

function workoutPlan({ planId, updatedAt, title, weekStart, nextPlan = null }) {
  return {
    schemaVersion: 2,
    planId,
    updatedAt,
    scheduleMode: 'fixed_weekdays',
    phase: { name: title, weekStart },
    weekSchedule: [
      { id: 'mon', day: 'Monday', isRestDay: false, workoutId: 'workout-a' },
    ],
    workouts: {
      'workout-a': {
        id: 'workout-a',
        title,
        durationMinutes: 45,
        exercises: [{ id: 'e1', name: 'Exercise', sets: 3, reps: '8' }],
      },
    },
    ...(nextPlan ? { nextPlan } : {}),
  };
}

test('verifies the exact existing Pickaxe HMAC message format', () => {
  const plan = workoutPlan({
    planId: 'plan-a',
    updatedAt: '2026-09-14T12:00:00.000Z',
    title: 'Plan A',
    weekStart: '2026-09-13',
  });
  const auth = authFor(plan, 'Member@Example.com');
  const parsed = bridge.parseBridgeAuth(auth);
  assert.deepEqual(parsed, { ...auth, email: 'member@example.com' });
  assert.equal(bridge.verifyBridgeAuth(parsed, TOKEN), true);
  assert.equal(bridge.verifyBridgeAuth(parsed, 'wrong-token'), false);
});

test('promotes an effective nextPlan.plan from the exact authorized outer record', () => {
  const nested = workoutPlan({
    planId: 'week-sep13',
    updatedAt: '2026-09-09T11:43:37.500Z',
    title: 'Lower-Body + Core Strength',
    weekStart: '2026-09-13',
  });
  const outer = workoutPlan({
    planId: 'week-sep06',
    updatedAt: '2026-09-09T11:43:37.486Z',
    title: 'Previous Week',
    weekStart: '2026-09-06',
    nextPlan: { effectiveFrom: '2026-09-13', plan: nested },
  });
  const auth = authFor(outer);
  outer._historyBridge = auth;
  nested._historyBridge = authFor(nested);

  const stored = JSON.stringify({ schemaVersion: 2, updatedAt: outer.updatedAt, plan: outer, entries: [] });
  const result = bridge.resolveAuthorizedPlanFromValues([stored], auth, '2026-09-14');
  assert.equal(result?.planId, 'week-sep13');
  assert.equal(result?.workouts?.['workout-a']?.title, 'Lower-Body + Core Strength');
});

test('does not promote nextPlan.plan before effectiveFrom', () => {
  const nested = workoutPlan({
    planId: 'future',
    updatedAt: '2026-09-09T11:43:37.500Z',
    title: 'Future Week',
    weekStart: '2026-09-20',
  });
  const outer = workoutPlan({
    planId: 'current',
    updatedAt: '2026-09-09T11:43:37.486Z',
    title: 'Current Week',
    weekStart: '2026-09-13',
    nextPlan: { effectiveFrom: '2026-09-20', plan: nested },
  });
  const auth = authFor(outer);
  outer._historyBridge = auth;
  nested._historyBridge = authFor(nested);

  const result = bridge.resolveAuthorizedPlanFromValues(
    [{ value: JSON.stringify(outer) }],
    auth,
    '2026-09-15',
  );
  assert.equal(result?.planId, 'current');
  assert.equal(result?.workouts?.['workout-a']?.title, 'Current Week');
});

test('accepts a nested plan bridge only once that nested plan is effective', () => {
  const nested = workoutPlan({
    planId: 'nested',
    updatedAt: '2026-09-09T11:43:37.500Z',
    title: 'Nested Active',
    weekStart: '2026-09-13',
  });
  const outer = workoutPlan({
    planId: 'outer',
    updatedAt: '2026-09-09T11:43:37.486Z',
    title: 'Outer',
    weekStart: '2026-09-06',
    nextPlan: { effectiveFrom: '2026-09-13', plan: nested },
  });
  nested._historyBridge = authFor(nested);
  outer._historyBridge = authFor(outer);

  const before = bridge.resolveAuthorizedPlanFromValues([outer], nested._historyBridge, '2026-09-12');
  const active = bridge.resolveAuthorizedPlanFromValues([outer], nested._historyBridge, '2026-09-14');
  assert.equal(before, null);
  assert.equal(active?.planId, 'nested');
});


test('creates and verifies a short-lived handoff proof for current and staged workouts', () => {
  const next = workoutPlan({
    planId: 'next',
    updatedAt: '2026-09-18T12:00:00.000Z',
    title: 'Next Week',
    weekStart: '2026-09-20',
  });
  next.workouts['next-b'] = {
    id: 'next-b',
    title: 'Next Week Mobility',
    durationMinutes: 20,
    exercises: [{ id: 'e2', name: 'Mobility', sets: 1, reps: '8' }],
  };
  next.weekSchedule.push({ id: 'wed', day: 'Wednesday', isRestDay: false, workoutId: 'next-b' });

  const current = workoutPlan({
    planId: 'current',
    updatedAt: '2026-09-18T10:00:00.000Z',
    title: 'Current Strength',
    weekStart: '2026-09-13',
    nextPlan: { effectiveFrom: '2026-09-20', plan: next },
  });
  const auth = authFor(current);
  const now = new Date('2026-09-18T20:00:00.000Z');
  const proof = bridge.createWorkoutHandoffProof(current, auth, TOKEN, now);

  assert.ok(proof);
  assert.equal(proof.email, 'member@example.com');
  assert.ok(proof.workouts.some((item) => item.id === 'workout-a' && item.title === 'Current Strength'));
  assert.ok(proof.workouts.some((item) => item.id === 'next-b' && item.title === 'Next Week Mobility'));

  const verified = bridge.verifyWorkoutHandoffProof(
    proof,
    auth,
    TOKEN,
    new Date('2026-09-18T20:10:00.000Z'),
  );
  assert.ok(verified);
  assert.deepEqual(
    bridge.resolveWorkoutFromHandoffProof(verified, 'next-b'),
    { id: 'next-b', title: 'Next Week Mobility' },
  );

  assert.equal(
    bridge.verifyWorkoutHandoffProof(
      { ...proof, signature: '0'.repeat(64) },
      auth,
      TOKEN,
      new Date('2026-09-18T20:10:00.000Z'),
    ),
    null,
  );
  assert.equal(
    bridge.verifyWorkoutHandoffProof(
      proof,
      auth,
      TOKEN,
      new Date('2026-09-18T20:31:00.000Z'),
    ),
    null,
  );
});


test('recovers the newest complete plan from a valid stale member capability only when enabled', () => {
  const oldPlan = workoutPlan({
    planId: 'old-flex',
    updatedAt: '2026-09-18T10:00:00.000Z',
    title: 'Old Flexible Plan',
    weekStart: '2026-09-13',
  });
  const latestPlan = workoutPlan({
    planId: 'next-fixed',
    updatedAt: '2026-09-19T12:00:00.000Z',
    title: 'Next Fixed Week',
    weekStart: '2026-09-20',
  });
  latestPlan._historyBridge = authFor(latestPlan);
  const staleAuth = authFor(oldPlan);

  assert.equal(
    bridge.resolveAuthorizedPlanFromValues([latestPlan], staleAuth, '2026-09-19'),
    null,
  );

  const recovered = bridge.resolveAuthorizedPlanFromValues(
    [latestPlan],
    staleAuth,
    '2026-09-19',
    { allowLatestFallback: true },
  );
  assert.equal(recovered?.planId, 'next-fixed');
  assert.equal(recovered?.workouts?.['workout-a']?.title, 'Next Fixed Week');
});


test('finds a usable plan inside nested Pickaxe memory wrappers', () => {
  const latestPlan = workoutPlan({
    planId: 'wrapped-plan',
    updatedAt: '2026-09-19T12:00:00.000Z',
    title: 'Wrapped Plan',
    weekStart: '2026-09-20',
  });
  const auth = authFor(latestPlan);
  const wrapped = {
    data: {
      result: {
        payload: {
          record: {
            content: JSON.stringify({
              envelope: {
                currentPlan: latestPlan,
              },
            }),
          },
        },
      },
    },
  };

  const recovered = bridge.resolveAuthorizedPlanFromValues(
    [wrapped],
    auth,
    '2026-09-19',
    { allowLatestFallback: true },
  );

  assert.equal(recovered?.planId, 'wrapped-plan');
  assert.equal(recovered?.workouts?.['workout-a']?.title, 'Wrapped Plan');
});


test('assembles a flexible current plan with a separate future fixed plan', () => {
  const current = {
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
  const auth = authFor(current);

  const future = {
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

  const combined = bridge.resolveAuthorizedPlanWindowFromValues(
    [current, future],
    auth,
    '2026-09-19',
    { allowLatestFallback: true },
  );

  assert.equal(combined?.scheduleMode, 'flexible_sequence');
  assert.equal(combined?.nextPlan?.effectiveFrom, '2026-09-20');
  assert.equal(combined?.nextPlan?.plan?.scheduleMode, 'fixed_weekdays');
  assert.equal(combined?.nextPlan?.plan?.phase?.weekStart, '2026-09-20');
  assert.equal(combined?.nextPlan?.plan?.weekSchedule?.length, 7);
});

test('keeps an existing future nextPlan instead of replacing it', () => {
  const future = workoutPlan({
    planId: 'future',
    updatedAt: '2026-09-19T12:00:00.000Z',
    title: 'Future Week',
    weekStart: '2026-09-20',
  });
  future.weekSchedule[0].date = '2026-09-21';

  const current = workoutPlan({
    planId: 'current',
    updatedAt: '2026-09-19T10:00:00.000Z',
    title: 'Current Week',
    weekStart: '2026-09-13',
    nextPlan: { effectiveFrom: '2026-09-20', plan: future },
  });
  const auth = authFor(current);

  const unrelatedLater = workoutPlan({
    planId: 'later',
    updatedAt: '2026-09-19T14:00:00.000Z',
    title: 'Later Week',
    weekStart: '2026-09-27',
  });

  const combined = bridge.resolveAuthorizedPlanWindowFromValues(
    [current, unrelatedLater],
    auth,
    '2026-09-19',
    { allowLatestFallback: true },
  );

  assert.equal(combined?.nextPlan?.effectiveFrom, '2026-09-20');
  assert.equal(combined?.nextPlan?.plan?.planId, 'future');
});


test('recovers a plan from Pickaxe text with one escaped JSON layer and no outer quotes', () => {
  const storedPlan = workoutPlan({
    planId: 'escaped-plan',
    updatedAt: '2026-09-19T12:00:00.000Z',
    title: 'Escaped Plan',
    weekStart: '2026-09-20',
  });
  const auth = authFor(storedPlan);
  storedPlan._historyBridge = auth;

  const escaped = JSON.stringify(storedPlan).replace(/"/g, '\\"');
  const recovered = bridge.resolveAuthorizedPlanFromValues(
    [escaped],
    auth,
    '2026-09-19',
    { allowLatestFallback: true },
  );

  assert.equal(recovered?.planId, 'escaped-plan');
  assert.equal(recovered?.workouts?.['workout-a']?.title, 'Escaped Plan');
});

test('recovers a plan from fenced or prefixed JSON text', () => {
  const storedPlan = workoutPlan({
    planId: 'fenced-plan',
    updatedAt: '2026-09-19T12:00:00.000Z',
    title: 'Fenced Plan',
    weekStart: '2026-09-20',
  });
  const auth = authFor(storedPlan);
  storedPlan._historyBridge = auth;

  const fence = String.fromCharCode(96, 96, 96);
  const stored = `Saved workout plan:\n${fence}json\n${JSON.stringify(storedPlan)}\n${fence}\n`;
  const recovered = bridge.resolveAuthorizedPlanFromValues(
    [stored],
    auth,
    '2026-09-19',
    { allowLatestFallback: true },
  );

  assert.equal(recovered?.planId, 'fenced-plan');
});

test('recovers a plan from Python-style literal text with trailing commas', () => {
  const storedPlan = workoutPlan({
    planId: 'python-plan',
    updatedAt: '2026-09-19T12:00:00.000Z',
    title: 'Python Plan',
    weekStart: '2026-09-20',
  });
  const auth = authFor(storedPlan);
  storedPlan._historyBridge = auth;

  const pythonStyle = JSON.stringify(storedPlan)
    .replace(/true/g, 'True')
    .replace(/false/g, 'False')
    .replace(/null/g, 'None')
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)":/g, "'$1':")
    .replace(/: "([^"\\]*(?:\\.[^"\\]*)*)"/g, ": '$1'")
    .replace(/([}\]])/g, ',$1');

  const recovered = bridge.resolveAuthorizedPlanFromValues(
    [pythonStyle],
    auth,
    '2026-09-19',
    { allowLatestFallback: true },
  );

  assert.equal(recovered?.planId, 'python-plan');
});
