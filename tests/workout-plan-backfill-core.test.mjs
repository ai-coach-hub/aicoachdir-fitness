import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillStoredWorkoutValue } from '../app/api/pickaxe/workout-plan/backfill-core.mjs';

const TOKEN = 'workspace-secret';
const EMAIL = 'member@example.com';

function basePlan() {
  return {
    planId: 'plan-123',
    updatedAt: '2026-09-14T20:00:00.000Z',
    weekSchedule: [{ date: '2026-09-14', workoutId: 'lower' }],
    workouts: { lower: { title: 'Lower-Body + Core Strength', exercises: [] } },
    notes: 'keep-me',
  };
}

test('adds signed bridge metadata without changing workout content', () => {
  const original = { schemaVersion: 2, plan: basePlan(), entries: [{ title: 'old history' }] };
  const result = backfillStoredWorkoutValue(JSON.stringify(original), EMAIL, TOKEN);

  assert.equal(result.changed, true);
  assert.equal(result.bridgesAdded, 1);
  const decoded = JSON.parse(result.value);
  assert.equal(decoded.plan.notes, 'keep-me');
  assert.deepEqual(decoded.plan.weekSchedule, original.plan.weekSchedule);
  assert.deepEqual(decoded.plan.workouts, original.plan.workouts);
  assert.equal(decoded.plan._historyBridge.email, EMAIL);
  assert.equal(decoded.plan._historyBridge.planId, original.plan.planId);
  assert.equal(decoded.plan._historyBridge.planUpdatedAt, original.plan.updatedAt);
  assert.match(decoded.plan._historyBridge.signature, /^[a-f0-9]{64}$/);
});

test('backfills both current and future nested plans independently', () => {
  const current = basePlan();
  const next = {
    ...basePlan(),
    planId: 'plan-456',
    updatedAt: '2026-09-20T20:00:00.000Z',
  };
  const envelope = { plan: { ...current, nextPlan: { effectiveFrom: '2026-09-20', plan: next } } };
  const result = backfillStoredWorkoutValue(envelope, EMAIL, TOKEN);

  assert.equal(result.changed, true);
  assert.equal(result.bridgesAdded, 2);
  assert.equal(result.value.plan._historyBridge.planId, 'plan-123');
  assert.equal(result.value.plan.nextPlan.plan._historyBridge.planId, 'plan-456');
});

test('is idempotent when an exact bridge already exists', () => {
  const first = backfillStoredWorkoutValue({ plan: basePlan() }, EMAIL, TOKEN);
  const second = backfillStoredWorkoutValue(first.value, EMAIL, TOKEN);
  assert.equal(second.changed, false);
  assert.equal(second.bridgesAdded, 0);
  assert.deepEqual(second.value, first.value);
});

test('does not modify objects that are not usable workout plans', () => {
  const value = {
    plan: {
      planId: 'x',
      updatedAt: '2026-09-14T20:00:00.000Z',
      workouts: {},
    },
    entries: [],
  };
  const result = backfillStoredWorkoutValue(value, EMAIL, TOKEN);
  assert.equal(result.changed, false);
  assert.equal(result.bridgesAdded, 0);
  assert.deepEqual(result.value, value);
});
