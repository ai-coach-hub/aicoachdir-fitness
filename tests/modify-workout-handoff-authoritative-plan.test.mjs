import test from 'node:test';
import assert from 'node:assert/strict';

import { findExactAuthorizedPlan } from '../app/api/pickaxe/modify-workout-handoff/authoritative-plan.mjs';

const auth = {
  email: 'member@example.com',
  planId: 'flex-plan',
  planUpdatedAt: '2026-09-18T15:00:00.000Z',
  signature: 'a'.repeat(64),
};

const flexible = {
  schemaVersion: 2,
  planId: auth.planId,
  updatedAt: auth.planUpdatedAt,
  scheduleMode: 'flexible_sequence',
  selectionMode: 'free_choice',
  flexibleSequence: [{ workoutId: 'mobility-recovery', sequenceIndex: 1 }],
  workouts: { 'mobility-recovery': { id: 'mobility-recovery', title: 'Mobility & Recovery' } },
};

test('finds an exact flexible plan without requiring weekSchedule', () => {
  const result = findExactAuthorizedPlan([JSON.stringify(flexible)], auth);
  assert.equal(result?.planId, 'flex-plan');
  assert.equal(result?.workouts?.['mobility-recovery']?.title, 'Mobility & Recovery');
});

test('finds an exact plan inside a history envelope', () => {
  const result = findExactAuthorizedPlan([{ value: JSON.stringify({ plan: flexible, entries: [] }) }], auth);
  assert.equal(result?.planId, 'flex-plan');
});

test('finds a matching nested nextPlan plan', () => {
  const outer = {
    planId: 'older',
    updatedAt: '2026-09-01T00:00:00.000Z',
    workouts: { old: { id: 'old', title: 'Old' } },
    nextPlan: { effectiveFrom: '2026-09-18', plan: flexible },
  };
  const result = findExactAuthorizedPlan([outer], auth);
  assert.equal(result?.planId, 'flex-plan');
});

test('rejects same planId with different updatedAt', () => {
  const stale = { ...flexible, updatedAt: '2026-09-18T14:59:00.000Z' };
  assert.equal(findExactAuthorizedPlan([stale], auth), null);
});
