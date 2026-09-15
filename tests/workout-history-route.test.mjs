import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const TOKEN = 'test-workspace-token';
process.env.WORKSPACE_API_TOKEN = TOKEN;

const { POST } = await import('../app/api/pickaxe/workout-history/route.ts');

function signedAuth(overrides = {}) {
  const base = {
    email: 'member@example.com',
    planId: 'current-plan',
    planUpdatedAt: '2026-09-15T18:00:00.000Z',
    ...overrides,
  };
  const signature = createHmac('sha256', TOKEN)
    .update(`${base.email}\n${base.planId}\n${base.planUpdatedAt}`, 'utf8')
    .digest('hex');
  return { ...base, signature };
}

function historyPayload(planId = 'older-plan') {
  return {
    schemaVersion: 1,
    updatedAt: '2026-09-15T18:30:00.000Z',
    entries: [
      {
        planId,
        scheduledDate: '2026-09-11',
        workoutId: 'qa-test',
        title: 'My Workouts QA Test',
        completedAt: '2026-09-11T18:00:00.000Z',
        durationMinutes: 10,
        difficulty: 'Good',
        notes: '',
        exercisesCompleted: 0,
        exercisesSkipped: 0,
        exercises: [],
      },
    ],
  };
}

function requestFor(auth, history) {
  return new Request('https://www.aicoachdir.com/api/pickaxe/workout-history', {
    method: 'POST',
    headers: {
      Origin: 'https://studio.pickaxe.co',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ auth, history }),
  });
}

test('accepts previous-workout entries from an older plan when current bridge auth is valid', async () => {
  const auth = signedAuth();
  let writtenValue = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://api.pickaxe.co/v1', '');
    if (path.startsWith('/studio/memory/list')) {
      return Response.json({ items: [{ id: 'history-memory', name: 'fitness workout history for ai coach' }] });
    }
    if (path.startsWith('/studio/memory/user/member%40example.com?')) {
      const currentPlan = {
        planId: auth.planId,
        updatedAt: auth.planUpdatedAt,
        weekSchedule: [],
        workouts: {},
      };
      const value = writtenValue ?? JSON.stringify({
        schemaVersion: 2,
        updatedAt: '2026-09-15T17:00:00.000Z',
        plan: currentPlan,
        entries: [],
      });
      return Response.json({ items: [{ value }] });
    }
    if (path === '/studio/memory/user/member%40example.com/history-memory' && init.method === 'PATCH') {
      writtenValue = JSON.parse(init.body).data.value;
      return Response.json({ ok: true });
    }
    throw new Error(`Unexpected fetch: ${init.method || 'GET'} ${path}`);
  };

  try {
    const response = await POST(requestFor(auth, historyPayload('older-plan')));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      savedAt: '2026-09-15T18:30:00.000Z',
    });
    assert.ok(writtenValue, 'history should be written');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('still rejects invalid bridge signatures before any Pickaxe write', async () => {
  const auth = signedAuth();
  auth.signature = '0'.repeat(64);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('should not fetch');
  };

  try {
    const response = await POST(requestFor(auth, historyPayload('older-plan')));
    assert.equal(response.status, 401);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
