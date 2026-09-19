import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { handleModifyWorkoutHandoff } from '../app/api/pickaxe/modify-workout-handoff/route-core.mjs';

const ORIGIN = 'https://studio.pickaxe.co';
const WORKSPACE_TOKEN = 'workspace-test-token';
const DEPLOYMENT_ID = 'deployment-test-token';
const MEMBER_USER_ID = 'user-member-123';
const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_ID = `modify-workout-${REQUEST_ID}`;
const PLAN = {
  schemaVersion: 2,
  planId: 'plan-1',
  updatedAt: '2026-09-18T15:00:00.000Z',
  scheduleMode: 'flexible_sequence',
  selectionMode: 'free_choice',
  flexibleSequence: [{ workoutId: 'mobility-recovery', sequenceIndex: 1 }],
  workouts: { 'mobility-recovery': { id: 'mobility-recovery', title: 'Mobility & Recovery' } },
};

function auth() {
  const email = 'member@example.com';
  const signature = createHmac('sha256', WORKSPACE_TOKEN)
    .update(`${email}\n${PLAN.planId}\n${PLAN.updatedAt}`, 'utf8')
    .digest('hex');
  return { email, planId: PLAN.planId, planUpdatedAt: PLAN.updatedAt, signature };
}

function requestFor(payload, origin = ORIGIN) {
  return new Request('https://www.aicoachdir.com/api/pickaxe/modify-workout-handoff', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function body(overrides = {}) {
  return {
    workoutId: 'mobility-recovery',
    planId: PLAN.planId,
    planUpdatedAt: PLAN.updatedAt,
    requestId: REQUEST_ID,
    historyBridge: auth(),
    ...overrides,
  };
}

function memberResponse() {
  return Response.json({ data: { userId: MEMBER_USER_ID, email: 'member@example.com' } });
}

function adapters(overrides = {}) {
  return {
    workspaceToken: WORKSPACE_TOKEN,
    deploymentId: DEPLOYMENT_ID,
    allowedOrigins: new Set([ORIGIN]),
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/studio/user/')) return memberResponse();
      if (u.endsWith('/triggers')) return Response.json({ success: true, result: 'Ready' });
      throw new Error(`Unexpected fetch ${u}`);
    },
    readPlan: async () => PLAN,
    claimHandoff: async () => 'claimed',
    markSucceeded: async () => {},
    markFailed: async () => {},
    ...overrides,
  };
}

test('valid request creates a dedicated session, triggers once, and returns that session', async () => {
  let triggerCalls = 0;
  let memberCalls = 0;
  const a = adapters({
    fetchImpl: async (url, init = {}) => {
      const u = String(url);
      if (u.includes('/studio/user/')) {
        memberCalls += 1;
        return memberResponse();
      }
      if (u.endsWith('/studio/workspace/history')) {
        throw new Error('workspace history must not be required for a new handoff session');
      }
      if (u.endsWith('/triggers')) {
        triggerCalls += 1;
        const payload = JSON.parse(init.body);
        assert.equal(payload.conversationId, SESSION_ID);
        assert.equal(payload.userId, MEMBER_USER_ID);
        assert.match(payload.message, /Mobility & Recovery/);
        return Response.json({ success: true, result: 'Ready' });
      }
      throw new Error(`Unexpected fetch ${u}`);
    },
  });

  const response = await handleModifyWorkoutHandoff({ request: requestFor(body()), ...a });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, sessionId: SESSION_ID });
  assert.equal(memberCalls, 1);
  assert.equal(triggerCalls, 1);
});

test('rejects bad bridge before member lookup or trigger', async () => {
  let calls = 0;
  const a = adapters({ fetchImpl: async () => { calls += 1; return Response.json({}); } });
  const response = await handleModifyWorkoutHandoff({
    request: requestFor(body({ historyBridge: { ...auth(), signature: '0'.repeat(64) } })),
    ...a,
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('rejects invalid requestId before member lookup or trigger', async () => {
  let calls = 0;
  const a = adapters({ fetchImpl: async () => { calls += 1; return Response.json({}); } });
  const response = await handleModifyWorkoutHandoff({
    request: requestFor(body({ requestId: 'not-a-uuid' })),
    ...a,
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test('returns 502 when portal member userId cannot be resolved', async () => {
  const a = adapters({
    fetchImpl: async (url) => {
      if (String(url).includes('/studio/user/')) return Response.json({ data: {} });
      throw new Error('trigger must not run');
    },
  });
  const response = await handleModifyWorkoutHandoff({ request: requestFor(body()), ...a });
  assert.equal(response.status, 502);
});

test('returns 404 for unknown workout', async () => {
  const response = await handleModifyWorkoutHandoff({
    request: requestFor(body({ workoutId: 'unknown' })),
    ...adapters(),
  });
  assert.equal(response.status, 404);
});

test('returns 409 when signed plan is stale or unavailable', async () => {
  const response = await handleModifyWorkoutHandoff({
    request: requestFor(body()),
    ...adapters({ readPlan: async () => null }),
  });
  assert.equal(response.status, 409);
});

test('reuses succeeded duplicate and returns the same session without second trigger', async () => {
  let fetchCalls = 0;
  const response = await handleModifyWorkoutHandoff({
    request: requestFor(body()),
    ...adapters({
      claimHandoff: async () => 'succeeded',
      fetchImpl: async (url) => {
        fetchCalls += 1;
        const u = String(url);
        if (u.includes('/studio/user/')) return memberResponse();
        throw new Error('trigger must not run for succeeded duplicate');
      },
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reused: true, sessionId: SESSION_ID });
  assert.equal(fetchCalls, 1);
});

test('returns 409 for processing duplicate', async () => {
  const response = await handleModifyWorkoutHandoff({
    request: requestFor(body()),
    ...adapters({ claimHandoff: async () => 'processing' }),
  });
  assert.equal(response.status, 409);
});

test('trigger failure returns 502 and marks failed', async () => {
  let failed = 0;
  const a = adapters({
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/studio/user/')) return memberResponse();
      if (u.endsWith('/triggers')) return Response.json({ success: false }, { status: 502 });
      throw new Error('unexpected');
    },
    markFailed: async () => { failed += 1; },
  });
  const response = await handleModifyWorkoutHandoff({ request: requestFor(body()), ...a });
  assert.equal(response.status, 502);
  assert.equal(failed, 1);
});
