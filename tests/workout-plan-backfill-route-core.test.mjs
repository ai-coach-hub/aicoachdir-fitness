import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleWorkoutBridgeBackfill } from '../app/api/pickaxe/workout-plan/backfill-route-core.mjs';

const TOKEN = 'workspace-secret';
const ORIGIN = 'https://studio.pickaxe.co';
const PLAN_MEMORY_ID = 'mem-plan';
const HISTORY_MEMORY_ID = 'mem-history';

function auth(email = 'admin@example.com') {
  const planId = 'admin-plan';
  const planUpdatedAt = '2026-09-15T10:00:00.000Z';
  const signature = createHmac('sha256', TOKEN)
    .update(`${email}\n${planId}\n${planUpdatedAt}`, 'utf8')
    .digest('hex');
  return { email, planId, planUpdatedAt, signature };
}

function request(body) {
  return new Request('https://www.aicoachdir.com/api/pickaxe/workout-plan/backfill', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function plan(id, updatedAt, bridged = false, email = 'member@example.com') {
  const value = {
    planId: id,
    updatedAt,
    weekSchedule: [{ date: '2026-09-15', workoutId: 'a' }],
    workouts: { a: { title: 'Workout A', exercises: [] } },
  };
  if (bridged) {
    value._historyBridge = {
      email,
      planId: id,
      planUpdatedAt: updatedAt,
      signature: createHmac('sha256', TOKEN)
        .update(`${email}\n${id}\n${updatedAt}`, 'utf8')
        .digest('hex'),
    };
  }
  return value;
}

function mockFetch({ applyExpected = false } = {}) {
  const calls = [];
  const values = new Map([
    ['member@example.com', JSON.stringify({ plan: plan('member-plan', '2026-09-14T10:00:00.000Z') })],
    ['done@example.com', JSON.stringify({ plan: plan('done-plan', '2026-09-13T10:00:00.000Z', true, 'done@example.com') })],
  ]);

  async function fetchImpl(url, init = {}) {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname + parsed.search, method: init.method || 'GET', body: init.body });
    if (parsed.pathname.endsWith('/studio/user/admin%40example.com')) {
      return Response.json({ email: 'admin@example.com' });
    }
    if (parsed.pathname.endsWith('/studio/memory/list')) {
      return Response.json({ items: [
        { id: PLAN_MEMORY_ID, name: 'Fitness Workout Plan v1' },
        { id: HISTORY_MEMORY_ID, name: 'Fitness Workout History v1' },
      ] });
    }
    if (parsed.pathname.endsWith('/studio/user/list')) {
      return Response.json({ items: [
        { email: 'member@example.com' },
        { email: 'done@example.com' },
      ] });
    }
    const read = parsed.pathname.match(/\/studio\/memory\/user\/([^/]+)$/);
    if (read && (init.method || 'GET') === 'GET') {
      const email = decodeURIComponent(read[1]);
      if (parsed.searchParams.get('memoryId') === PLAN_MEMORY_ID && values.has(email)) {
        return Response.json({ items: [{ memoryId: PLAN_MEMORY_ID, value: values.get(email) }] });
      }
      return Response.json({ items: [] });
    }
    const patch = parsed.pathname.match(/\/studio\/memory\/user\/([^/]+)\/([^/]+)$/);
    if (patch && init.method === 'PATCH') {
      assert.equal(applyExpected, true);
      const email = decodeURIComponent(patch[1]);
      const memoryId = decodeURIComponent(patch[2]);
      assert.equal(memoryId, PLAN_MEMORY_ID);
      const body = JSON.parse(init.body);
      values.set(email, body.data.value);
      return Response.json({ ok: true });
    }
    throw new Error(`unexpected fetch ${init.method || 'GET'} ${parsed.pathname}${parsed.search}`);
  }

  return { fetchImpl, calls, values };
}

test('rejects invalid authorization before calling Pickaxe', async () => {
  const mock = mockFetch();
  const invalid = auth();
  invalid.signature = '0'.repeat(64);
  const response = await handleWorkoutBridgeBackfill({
    request: request({ auth: invalid, confirm: 'BACKFILL_WORKOUT_BRIDGES_V1', dryRun: false }),
    token: TOKEN,
    fetchImpl: mock.fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  assert.equal(response.status, 401);
  assert.equal(mock.calls.length, 0);
});

test('dry run counts missing bridges without writing memory', async () => {
  const mock = mockFetch();
  const response = await handleWorkoutBridgeBackfill({
    request: request({ auth: auth(), confirm: 'BACKFILL_WORKOUT_BRIDGES_V1', dryRun: true }),
    token: TOKEN,
    fetchImpl: mock.fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    dryRun: true,
    usersScanned: 2,
    usersChanged: 1,
    memoriesChanged: 1,
    bridgesAdded: 1,
    failures: 0,
  });
  assert.equal(mock.calls.some((call) => call.method === 'PATCH'), false);
});

test('apply patches only memories missing bridge metadata', async () => {
  const mock = mockFetch({ applyExpected: true });
  const response = await handleWorkoutBridgeBackfill({
    request: request({ auth: auth(), confirm: 'BACKFILL_WORKOUT_BRIDGES_V1', dryRun: false }),
    token: TOKEN,
    fetchImpl: mock.fetchImpl,
    allowedOrigins: new Set([ORIGIN]),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.usersChanged, 1);
  assert.equal(body.bridgesAdded, 1);
  const patches = mock.calls.filter((call) => call.method === 'PATCH');
  assert.equal(patches.length, 1);
  const saved = JSON.parse(mock.values.get('member@example.com'));
  assert.equal(saved.plan._historyBridge.email, 'member@example.com');
  assert.equal(saved.plan.workouts.a.title, 'Workout A');
});
