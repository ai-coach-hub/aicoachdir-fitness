import test from 'node:test';
import assert from 'node:assert/strict';

const { isWorkoutPlanCacheFresh } = await import(
  '../app/api/pickaxe/workout-plan/route-core.mjs'
);

const NOW = new Date('2026-09-20T18:52:00.000Z').getTime();

test('accepts a recently refreshed workout plan cache entry', () => {
  assert.equal(
    isWorkoutPlanCacheFresh(
      { cacheUpdatedAt: '2026-09-20T18:51:45.000Z' },
      NOW,
    ),
    true,
  );
});

test('rejects a workout plan cache entry older than 30 seconds', () => {
  assert.equal(
    isWorkoutPlanCacheFresh(
      { cacheUpdatedAt: '2026-09-20T18:51:29.000Z' },
      NOW,
    ),
    false,
  );
});

test('rejects malformed cache timestamps', () => {
  assert.equal(
    isWorkoutPlanCacheFresh({ cacheUpdatedAt: 'not-a-date' }, NOW),
    false,
  );
});

test('keeps legacy custom cache readers without freshness metadata compatible', () => {
  assert.equal(isWorkoutPlanCacheFresh({}, NOW), true);
});
