import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTriggerMessage,
  findVerifiedSession,
  handoffKey,
  parseModifyHandoffRequest,
  resolveWorkout,
} from '../app/api/pickaxe/modify-workout-handoff/core.mjs';

const bridge = {
  email: 'member@example.com',
  planId: 'plan-1',
  planUpdatedAt: '2026-09-18T15:00:00.000Z',
  signature: 'a'.repeat(64),
};

function validRequest(overrides = {}) {
  return {
    workoutId: 'mobility-recovery',
    planId: bridge.planId,
    planUpdatedAt: bridge.planUpdatedAt,
    sessionId: 'session-123',
    historyBridge: bridge,
    ...overrides,
  };
}

test('parses a valid modify handoff request', () => {
  const parsed = parseModifyHandoffRequest(validRequest());
  assert.equal(parsed?.workoutId, 'mobility-recovery');
  assert.equal(parsed?.sessionId, 'session-123');
  assert.deepEqual(parsed?.historyBridge, bridge);
});

test('rejects invalid or mismatched handoff request fields', () => {
  assert.equal(parseModifyHandoffRequest(validRequest({ workoutId: '' })), null);
  assert.equal(parseModifyHandoffRequest(validRequest({ workoutId: 'x'.repeat(201) })), null);
  assert.equal(parseModifyHandoffRequest(validRequest({ sessionId: 'x'.repeat(301) })), null);
  assert.equal(parseModifyHandoffRequest(validRequest({ planId: 'other-plan' })), null);
  assert.equal(parseModifyHandoffRequest(validRequest({ planUpdatedAt: '2026-09-18T15:00:01.000Z' })), null);
  assert.equal(parseModifyHandoffRequest(validRequest({ historyBridge: null })), null);
});

test('verifies session by responseId, formId, and normalized member identity', () => {
  const rows = {
    success: true,
    data: [{ responseId: 'session-123', formId: 'W7S4B963AI9ELAW', userId: 'Member@Example.com' }],
  };
  const match = findVerifiedSession(rows, 'session-123', 'member@example.com');
  assert.equal(match?.responseId, 'session-123');
});

test('rejects session belonging to another member or Pickaxe', () => {
  assert.equal(findVerifiedSession({ data: [{ responseId: 'session-123', formId: 'OTHER', userId: 'member@example.com' }] }, 'session-123', 'member@example.com'), null);
  assert.equal(findVerifiedSession({ data: [{ responseId: 'session-123', formId: 'W7S4B963AI9ELAW', userId: 'other@example.com' }] }, 'session-123', 'member@example.com'), null);
});

test('resolves workout title from authoritative plan only', () => {
  const plan = { planId: bridge.planId, updatedAt: bridge.planUpdatedAt, workouts: { 'mobility-recovery': { id: 'mobility-recovery', title: 'Mobility & Recovery' } } };
  assert.deepEqual(resolveWorkout(plan, 'mobility-recovery'), { id: 'mobility-recovery', title: 'Mobility & Recovery' });
  assert.equal(resolveWorkout(plan, 'unknown'), null);
});

test('builds trigger message without credentials or member identity', () => {
  const message = buildTriggerMessage({ id: 'mobility-recovery', title: 'Mobility & Recovery' });
  for (const required of [
    'Mobility & Recovery',
    'mobility-recovery',
    'Retrieve the newest saved My Workouts plan using Get Workout Plan before making any changes.',
    'Ask the member one concise question about what they want to change.',
    'Do not save or alter the plan until the member provides the requested change.',
    'Preserve all unrelated workouts and plan details.',
  ]) assert.ok(message.includes(required));
  assert.doesNotMatch(message, /member@example\.com|signature|workspace|deployment/i);
});

test('handoff key is deterministic and sensitive to workout/session/version', () => {
  const first = handoffKey('Member@Example.com', 'session-123', bridge.planUpdatedAt, 'mobility-recovery');
  const second = handoffKey('member@example.com', 'session-123', bridge.planUpdatedAt, 'mobility-recovery');
  const changed = handoffKey('member@example.com', 'session-124', bridge.planUpdatedAt, 'mobility-recovery');
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});


test('resolves a workout from the immediately staged next-week plan', () => {
  const plan = {
    planId: bridge.planId,
    updatedAt: bridge.planUpdatedAt,
    workouts: {
      'current-strength': { id: 'current-strength', title: 'Current Strength' },
    },
    nextPlan: {
      effectiveFrom: '2026-09-20',
      plan: {
        planId: 'plan-2',
        updatedAt: '2026-09-18T16:00:00.000Z',
        workouts: {
          'next-mobility': { id: 'next-mobility', title: 'Next Week Mobility' },
        },
      },
    },
  };

  assert.deepEqual(resolveWorkout(plan, 'next-mobility'), {
    id: 'next-mobility',
    title: 'Next Week Mobility',
  });
});
