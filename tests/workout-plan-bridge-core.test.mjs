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
