import test from 'node:test';
import assert from 'node:assert/strict';
import { decideExistingHandoff } from '../lib/modify-workout-handoff-db-core.mjs';

const now = new Date('2026-09-18T17:00:00.000Z');
const future = new Date('2026-09-18T17:00:30.000Z');
const past = new Date('2026-09-18T16:59:59.000Z');

test('reuses succeeded handoff before expiry', () => {
  assert.equal(decideExistingHandoff('succeeded', future, now), 'succeeded');
});

test('blocks duplicate processing handoff before expiry', () => {
  assert.equal(decideExistingHandoff('processing', future, now), 'processing');
});

test('reclaims failed or expired handoff', () => {
  assert.equal(decideExistingHandoff('failed', future, now), 'claim');
  assert.equal(decideExistingHandoff('succeeded', past, now), 'claim');
  assert.equal(decideExistingHandoff('processing', past, now), 'claim');
});
