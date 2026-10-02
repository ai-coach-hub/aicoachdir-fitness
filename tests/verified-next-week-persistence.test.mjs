import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';

const SAVE = 'ACTIONNYM6UU9XWNX8PQTF79PV';
const GET = 'ACTION7YYK7T0TVOGSV4AZIV45';
const NOW = '2026-10-01T19:00:00.000Z';
const REQUEST = 'next week i will be able to do otf on monday and tuesday. Wednesday i will have access to a basic hotel gym. on thursday and friday i will be at the house with no equipment. please give me a workout for next week m-f 60 min each.';
const source = await readFile(new URL('../app/api/fitness/chat/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source + '\nmodule.exports.__test = { requiresConfirmedSavedPlanMutation, requiresValidatedWorkoutDelivery, isSavedPlanReadQuery, buildPickaxeMessage, selectCurrentTurnDelivery, confirmSavedMutation, writePlanMemory, extractFormalPlanFromValues, unwrapMemoryValue, continuePendingPlanRequest, buildSavedMutationMessage, collectMemoryValues, checkRequestedWeek, fetchActionRunsForSession };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(fetchImpl = async () => { throw new Error('Unexpected network request'); }) {
  const module = { exports: {} };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const sandbox = {
    module, exports: module.exports, console,
    Request, Response, Headers, URL, AbortSignal, AbortController,
    Date: FixedDate, Intl, Buffer, crypto,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 2)), clearTimeout,
    fetch: fetchImpl,
    process: { env: { PICKAXE_WORKSPACE_API_TOKEN: 'test-workspace-key', PICKAXE_FITNESS_COACH_DEPLOYMENT_ID: 'test-deployment-key' } },
    require: (name) => {
      if (name === 'node:crypto') return crypto;
      // Cross-realm objects must be compared structurally, not by VM prototypes.
      if (name === 'node:util') return { isDeepStrictEqual: (a, b) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))) };
      if (name === '@clerk/nextjs/server') return { currentUser: async () => ({ id: 'test-member', primaryEmailAddressId: 'primary', emailAddresses: [{ id: 'primary', emailAddress: 'member@example.invalid' }] }) };
      if (name === '@/lib/memberIdentity') return { canonicalMemberEmail: (email) => email.trim().toLowerCase() };
      if (name === '@/lib/fitnessMembershipDb') return { memberHasFitnessAccess: async () => true };
      throw new Error('Unexpected import: ' + name);
    },
  };
  vm.runInNewContext(compiled, sandbox, { timeout: 5000 });
  return module.exports;
}

function week(start, next = false) {
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(start + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ids = next ? ['', 'otf', 'otf', 'hotel', 'home-strength', 'home-mobility', ''] : ['', 'otf', 'otf', 'home-20', 'otf', 'otf', ''];
  const workouts = {};
  for (const id of ids.filter(Boolean)) workouts[id] = {
    id, title: id, durationMinutes: next || id === 'otf' ? 60 : 20,
    requiredEquipment: id === 'hotel' ? ['dumbbells'] : [],
    exercises: [{ id: id + '-activity', name: id === 'otf' ? 'OTF Class' : 'Walking', trackingType: 'time', duration: { target: 60, unit: 'min' } }],
  };
  return { schemaVersion: 2, planId: 'week-' + start, updatedAt: NOW, userTimezone: 'America/Chicago', scheduleMode: 'fixed_weekdays', weekSchedule: dates.map((date, i) => ({ day: days[i], date, isRestDay: !ids[i], workoutId: ids[i] || null })), workouts };
}
const current = week('2026-09-27');
const future = week('2026-10-04', true);
const clone = (value) => JSON.parse(JSON.stringify(value));
function run(id, actionId, plan, content = 'SUCCESS: Workout plan saved and verified\nFINAL_DELIVERY_START\nSaved your workout plan.\nFINAL_DELIVERY_END') {
  return { id, sourceActionId: actionId, sessionId: 'fitness-chat-regression01', createdAt: NOW, status: 'success', content, parsedArgs: { plan_json: JSON.stringify(plan) } };
}

test('exact member request uses the saved workflow AND the structured prompt', () => {
  const f = load().__test;
  assert.equal(f.requiresConfirmedSavedPlanMutation(REQUEST), true);
  assert.equal(f.requiresValidatedWorkoutDelivery(REQUEST), true);
  assert.equal(f.isSavedPlanReadQuery(REQUEST), false);
  assert.match(f.buildPickaxeMessage(REQUEST), /_saveScope set to next_week/);
  assert.match(f.buildPickaxeMessage(REQUEST), /successful Get Workout Plan or feasibility validation is not a save/);
});

test('reading next week and explicitly preview-only requests do not mutate a plan', () => {
  const f = load().__test;
  for (const text of ['Show me next week workouts', 'What workouts are saved for next week?', 'Give me a workout for next week, do not save it', "Just preview next week's workouts"]) {
    assert.equal(f.requiresConfirmedSavedPlanMutation(text), false, text);
  }
});

test('Get Plan and validation FINAL_DELIVERY cannot finish a save or supply its payload', () => {
  const f = load().__test;
  const read = run('read', GET, current, 'FINAL_DELIVERY_START\nHere is your old plan.\nFINAL_DELIVERY_END\nPLAN_START::' + JSON.stringify(current) + '::PLAN_END');
  assert.equal(f.selectCurrentTurnDelivery([read], Date.parse(NOW), true).finalDelivery, '');
  const validation = run('validation', SAVE, future, 'SUCCESS: Feasibility validation\nFINAL_DELIVERY_START\nA feasible workout.\nFINAL_DELIVERY_END');
  assert.equal(f.selectCurrentTurnDelivery([validation], Date.parse(NOW), true).finalDelivery, '');
  const selected = f.selectCurrentTurnDelivery([read, run('saved', SAVE, future)], Date.parse(NOW), true);
  assert.equal(selected.runId, 'saved');
  assert.equal(selected.planPayload.planId, future.planId);
});

test('prior, failed and undated save runs cannot confirm a new turn', () => {
  const f = load().__test;
  const good = run('saved', SAVE, future);
  const stale = { ...good, createdAt: '2026-10-01T18:59:00.000Z' };
  for (const bad of [stale, { ...good, status: 'failed' }, { ...good, createdAt: undefined }, { ...good, id: undefined }]) {
    assert.equal(f.selectCurrentTurnDelivery([bad], Date.parse(NOW), true).finalDelivery, '');
  }
  assert.equal(f.selectCurrentTurnDelivery([good], Date.parse(NOW), true, new Set(['saved'])).finalDelivery, '');
});

test('a saved next-week root is re-staged under an unchanged current week and read back', async () => {
  const f = load().__test;
  let stored = clone(future);
  let writes = 0;
  const result = await f.confirmSavedMutation({ message: REQUEST, before: clone(current), candidate: clone(future), read: async () => clone(stored), write: async (value) => { writes++; stored = clone(value); return true; } });
  assert.equal(writes, 1);
  assert.deepEqual(result.weekSchedule, current.weekSchedule);
  assert.deepEqual(result.workouts, current.workouts);
  assert.equal(result.nextPlan.effectiveFrom, '2026-10-04');
  assert.deepEqual(result.nextPlan.plan, future);
});

test('an already correctly staged week is verified without a duplicate write', async () => {
  const f = load().__test;
  const stored = { ...clone(current), nextPlan: { effectiveFrom: '2026-10-04', plan: clone(future) } };
  const result = await f.confirmSavedMutation({ message: REQUEST, before: clone(current), candidate: clone(future), read: async () => clone(stored), write: async () => { throw new Error('Duplicate write'); } });
  assert.equal(result.nextPlan.plan.planId, future.planId);
});

test('an old plan on readback is not proof of a new save', async () => {
  const f = load().__test;
  await assert.rejects(f.confirmSavedMutation({ message: REQUEST, before: clone(current), candidate: clone(future), read: async () => clone(current), write: async () => { throw new Error('Must not invent missing next week'); } }), /saved-candidate-not-present/);
});

test('wrong week, missing weekdays and wrong session duration are rejected', async () => {
  const f = load().__test;
  for (const invalid of [clone(current), { ...clone(future), weekSchedule: future.weekSchedule.slice(0, 5) }, { ...clone(future), workouts: { ...clone(future.workouts), hotel: { ...clone(future.workouts.hotel), durationMinutes: 20 } } }]) {
    await assert.rejects(f.confirmSavedMutation({ message: REQUEST, before: clone(current), candidate: invalid, read: async () => clone(invalid), write: async () => { throw new Error('Must not write invalid plan'); } }));
  }
});

test('a newer concurrent edit is not overwritten with the prior snapshot', async () => {
  const f = load().__test;
  let reads = 0;
  const changed = clone(future);
  changed.workouts.hotel.title = 'Newer separate edit';
  await assert.rejects(f.confirmSavedMutation({ message: REQUEST, before: clone(current), candidate: clone(future), read: async () => clone(++reads === 1 ? future : changed), write: async () => { throw new Error('Must not overwrite concurrent edit'); } }), /concurrent-plan-change/);
});

test('member plan extraction unwraps records and selects the newest root including nextPlan', () => {
  const f = load().__test;
  const older = { ...clone(current), updatedAt: '2026-09-28T00:00:00Z' };
  const latest = { ...clone(current), nextPlan: { effectiveFrom: '2026-10-04', plan: clone(future) } };
  const result = f.extractFormalPlanFromValues([JSON.stringify(older), { value: JSON.stringify(latest) }]);
  assert.equal(result.nextPlan.plan.planId, future.planId);
});

test('plan memory verification requires the exact written plan rather than any formal plan', async () => {
  let writes = 0;
  const f = load(async (url, init = {}) => {
    if (String(url).includes('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }] });
    if (init.method === 'PATCH') { writes++; return Response.json({ ok: true }); }
    return Response.json({ data: [{ value: JSON.stringify(current) }] });
  }).__test;
  assert.equal(await f.writePlanMemory('member@example.invalid', 'test', clone(future)), false);
  assert.equal(writes, 1);
});

test('authenticated POST waits beyond the read Action, stages both weeks, and GET returns them', async () => {
  let stored = clone(current);
  let started = false;
  let savePolls = 0;
  let writes = 0;
  let coachCalls = 0;
  const history = [{ workoutId: 'otf', scheduledDate: '2026-09-28', completedAt: '2026-09-28T18:00:00Z', exercises: [] }];
  const readAction = run('read', GET, current, 'FINAL_DELIVERY_START\nThis is the current saved week.\nFINAL_DELIVERY_END\nPLAN_START::' + JSON.stringify(current) + '::PLAN_END');
  const app = load(async (url, init = {}) => {
    const address = new URL(String(url));
    if (address.pathname.endsWith('/completions')) {
      started = true;
      coachCalls++;
      assert.match(JSON.parse(init.body).message, /_saveScope set to next_week/);
      return new Promise((resolve) => init.signal.addEventListener('abort', () => resolve(Response.json({ result: 'Saved' })), { once: true }));
    }
    if (address.pathname.endsWith('/action/runs')) {
      if (!started) return Response.json({ data: { runs: [] } });
      if (address.searchParams.get('actionId') === GET) return Response.json({ data: { runs: [readAction] } });
      savePolls++;
      if (savePolls < 2) return Response.json({ data: { runs: [] } });
      if (savePolls === 2) stored = clone(future);
      return Response.json({ data: { runs: [run('saved', SAVE, future)] } });
    }
    if (address.pathname.endsWith('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }, { id: 'history-memory', name: 'fitness-workout-history-v1' }] });
    if (init.method === 'PATCH') {
      assert.ok(address.pathname.endsWith('/plan-memory'));
      stored = JSON.parse(JSON.parse(init.body).data.value);
      writes++;
      return Response.json({ ok: true });
    }
    if (address.searchParams.get('memoryId') === 'plan-memory') return Response.json({ data: [{ value: JSON.stringify(stored) }] });
    if (address.searchParams.get('memoryId') === 'history-memory') return Response.json({ data: [{ value: JSON.stringify({ entries: history }) }] });
    throw new Error('Unexpected fetch: ' + address.pathname);
  });
  const response = await app.POST(new Request('https://example.invalid/api/fitness/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: REQUEST, conversationId: 'fitness-chat-regression01' }) }));
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.savedPlanVerified, true);
  assert.deepEqual(data.plan.weekSchedule, current.weekSchedule);
  assert.equal(data.plan.nextPlan.plan.workouts.hotel.durationMinutes, 60);
  assert.equal(data.pendingPlanRequest, '');
  assert.equal(coachCalls, 1);
  assert.equal(writes, 1);
  assert.ok(savePolls >= 2);
  const get = await (await app.GET()).json();
  assert.deepEqual(get.plan.weekSchedule, current.weekSchedule);
  assert.deepEqual(get.plan.workouts, current.workouts);
  assert.equal(get.plan.nextPlan.effectiveFrom, '2026-10-04');
  assert.equal(get.plan.nextPlan.plan.workouts.hotel.durationMinutes, 60);
  assert.deepEqual(get.historyEntries, history);
});


test('read-only sync complaints and future-week previews never start a save', () => {
  const f = load().__test;
  for (const message of ["My next week workouts are not showing", "Where is next week's plan?", "Next week workouts?", "Show me next week's workouts", "Give me workouts for next week but don't save them"]) {
    assert.equal(f.requiresConfirmedSavedPlanMutation(message), false, message);
  }
});

test('equipment clarification keeps the original week and session duration without changing unrelated chat', () => {
  const f = load().__test;
  const reply = "I don't know what's in the hotel gym yet, so do your best to guess and I can adjust when I'm there.";
  const effective = f.continuePendingPlanRequest(reply, REQUEST);
  assert.equal(f.requiresConfirmedSavedPlanMutation(effective), true);
  assert.match(effective, /60 min each/);
  assert.match(effective, /next week/);
  assert.equal(f.continuePendingPlanRequest('How do I stretch?', REQUEST), 'How do I stretch?');
  assert.equal(f.continuePendingPlanRequest("Just preview it, don't save", REQUEST), "Just preview it, don't save");
  const prompt = f.buildSavedMutationMessage(effective, reply, clone(current));
  assert.match(prompt, /2026-10-04 through 2026-10-10/);
  assert.match(prompt, /_saveScope=next_week/);
  assert.equal(prompt.split('\nMEMBER MESSAGE:\n').at(-1), reply);
});

test('action argument JSON and double-encoded memories unwrap without inventing a plan', () => {
  const f = load().__test;
  const saved = { ...run('saved', SAVE, future), parsedArgs: undefined, args: JSON.stringify({ plan_json: JSON.stringify(future) }) };
  assert.equal(f.selectCurrentTurnDelivery([saved], Date.parse(NOW), true).planPayload.planId, future.planId);
  assert.equal(f.unwrapMemoryValue({ memory_value: JSON.stringify(JSON.stringify(future)) }).planId, future.planId);
});

test('validation mode, null payloads, and error-marked actions cannot confirm a save', () => {
  const f = load().__test;
  for (const bad of [
    { ...run('saved', SAVE, future), parsedArgs: { mode: 'validate_workout_feasibility', plan_json: JSON.stringify(future) } },
    run('saved', SAVE, future, 'SUCCESS: Workout plan saved and verified\nPLAN_START::null::PLAN_END'),
    run('saved', SAVE, future, 'SUCCESS: Workout plan saved and verified\nERROR: Readback failed'),
  ]) assert.equal(f.selectCurrentTurnDelivery([bad], Date.parse(NOW), true).finalDelivery, '');
});

test('a plan lookup error blocks generation instead of being treated as a new empty account', async () => {
  let coachCalls = 0;
  const app = load(async (url) => {
    if (String(url).endsWith('/completions')) { coachCalls++; throw new Error('Must not generate'); }
    if (String(url).includes('/action/runs')) return Response.json({ data: { runs: [] } });
    if (String(url).includes('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }] });
    return Response.json({ error: 'unavailable' }, { status: 503 });
  });
  const response = await app.POST(new Request('https://example.invalid/api/fitness/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: REQUEST, conversationId: 'fitness-chat-regression01' }) }));
  assert.equal(response.status, 503);
  assert.equal(coachCalls, 0);
});

test('clarification returns as not saved and carries the pending request for the next message', async () => {
  const app = load(async (url, init = {}) => {
    const address = String(url);
    if (address.endsWith('/completions')) return Response.json({ result: 'What equipment is in the hotel gym?' });
    if (address.includes('/action/runs')) return Response.json({ data: { runs: [] } });
    if (address.includes('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }] });
    if (init.method && init.method !== 'GET') throw new Error('Must not write');
    return Response.json({ data: [{ value: JSON.stringify(current) }] });
  });
  const response = await app.POST(new Request('https://example.invalid/api/fitness/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: REQUEST, conversationId: 'fitness-chat-regression01' }) }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.savedPlanVerified, false);
  assert.equal(data.pendingPlanRequest, REQUEST);
  assert.match(data.response, /not been saved yet/);
});

test('coach prose saying saved is not accepted without a save action receipt', async () => {
  const app = load(async (url) => {
    const address = String(url);
    if (address.endsWith('/completions')) return Response.json({ result: 'Your plan is saved and ready. Would you like anything else?' });
    if (address.includes('/action/runs')) return Response.json({ data: { runs: [] } });
    if (address.includes('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }] });
    return Response.json({ data: [{ value: JSON.stringify(current) }] });
  });
  const response = await app.POST(new Request('https://example.invalid/api/fitness/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: REQUEST, conversationId: 'fitness-chat-regression01' }) }));
  const data = await response.json();
  assert.equal(response.status, 504);
  assert.equal(data.savedPlanVerified, false);
  assert.equal(data.response, undefined);
});

test('newest root controls exact write verification, not a matching older duplicate', async () => {
  const old = clone(future);
  old.updatedAt = '2026-09-30T00:00:00Z';
  const newest = clone(future);
  newest.workouts.hotel.title = 'Newer edit';
  const f = load(async (url, init = {}) => {
    if (String(url).includes('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }] });
    if (init.method === 'PATCH') return Response.json({ ok: true });
    return Response.json({ data: [{ value: JSON.stringify(old) }, { value: JSON.stringify(newest) }] });
  }).__test;
  assert.equal(await f.writePlanMemory('member@example.invalid', 'test', old), false);
});

test('guarded repair refuses to patch if a newer plan appeared before the write', async () => {
  let writes = 0;
  const f = load(async (url, init = {}) => {
    if (String(url).includes('/memory/list')) return Response.json({ data: [{ id: 'plan-memory', name: 'fitness-workout-plan-v1' }] });
    if (init.method === 'PATCH' || init.method === 'POST') { writes++; return Response.json({ ok: true }); }
    return Response.json({ data: [{ value: JSON.stringify(current) }] });
  }).__test;
  assert.equal(await f.writePlanMemory('member@example.invalid', 'test', future, { expectedCurrent: future }), false);
  assert.equal(writes, 0);
});

test('OTF commitments and no-equipment days are checked against the requested weekdays', () => {
  const f = load().__test;
  const wrongClass = clone(future);
  wrongClass.workouts.otf.title = 'Home circuit';
  assert.throws(() => f.checkRequestedWeek(REQUEST, wrongClass, '2026-10-04'), /class-commitment-mismatch/);
  const wrongEquipment = clone(future);
  wrongEquipment.workouts['home-strength'].requiredEquipment = ['dumbbells'];
  assert.throws(() => f.checkRequestedWeek(REQUEST, wrongEquipment, '2026-10-04'), /equipment-mismatch/);
  f.checkRequestedWeek(REQUEST, clone(future), '2026-10-04');
});

test('future completion flags and wrong weekday labels are rejected', () => {
  const f = load().__test;
  const completed = clone(future);
  completed.weekSchedule[1].completed = true;
  assert.throws(() => f.checkRequestedWeek(REQUEST, completed, '2026-10-04'), /cannot-be-completed/);
  const labels = clone(future);
  labels.weekSchedule[1].day = 'Friday';
  assert.throws(() => f.checkRequestedWeek(REQUEST, labels, '2026-10-04'), /weekday-date-mismatch/);
});

test('deleted memory wrappers cannot resurrect their nested old plans', () => {
  const f = load().__test;
  const values = f.collectMemoryValues({ data: [{ deleted: true, data: { value: JSON.stringify(future) } }, { value: JSON.stringify(current) }] });
  assert.equal(values.length, 1);
  assert.equal(f.extractFormalPlanFromValues(values).planId, current.planId);
});

test('action results from another conversation are excluded even if an upstream query returns them', async () => {
  const f = load(async () => Response.json({ data: { runs: [{ ...run('foreign', SAVE, future), sessionId: 'someone-else' }, run('local', SAVE, future)] } })).__test;
  const rows = await f.fetchActionRunsForSession('fitness-chat-regression01', 'test', [SAVE]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'local');
});
