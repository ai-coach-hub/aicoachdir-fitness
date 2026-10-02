import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

const source = await readFile(new URL('../app/fitness/chat/page.tsx', import.meta.url), 'utf8');
const injected = source.replace('  const selectedThread = useMemo(', `
  globalThis.__capture({loadPlan, send, newChat, resumeThread, setTab, setInput,
    plan, status, pendingPlanRequest, planLoading, planError});
  const selectedThread = useMemo(`);
const compiled = ts.transpileModule(injected + '\nmodule.exports.__test = { nextSavedPlan, workoutMap, completionKey, cleanCoachText };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0, 'the updated member page must transpile');

function hub(fetchImpl) {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, capture, effects = [];
  const events = new Map();
  const eventTarget = {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name); },
  };
  const react = {
    useState: (initial) => {
      const i = stateIndex++;
      if (i >= states.length) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: (initial) => { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useMemo: (fn) => fn(),
    useEffect: (fn, deps) => effects.push({ fn, deps }),
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, console, crypto, Date, Intl, Uint32Array,
    Request, Response, Headers, URL, fetch: fetchImpl,
    window: { ...eventTarget, crypto, localStorage: { getItem: () => null, setItem: () => {} } },
    document: { ...eventTarget, visibilityState: 'visible' },
    __capture: (value) => { capture = value; },
    require: (name) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'next/link') return { __esModule: true, default: 'a' };
      if (name === '@clerk/nextjs') return { useClerk: () => ({ signOut: async () => {} }) };
      throw new Error('Unexpected import: ' + name);
    },
  });
  function render() {
    stateIndex = refIndex = 0; effects = [];
    module.exports.default();
    return capture;
  }
  const result = { render, events, effects: () => effects, helpers: module.exports.__test };
  result.render();
  return result;
}
const future = { planId: 'next', weekSchedule: [{ day: 'Monday', date: '2026-10-05', workoutId: 'same-id' }], workouts: { 'same-id': { title: 'OTF', durationMinutes: 60 } } };
const current = { planId: 'current', weekSchedule: [{ day: 'Monday', date: '2026-09-28', workoutId: 'same-id' }], workouts: { 'same-id': { title: 'Current workout', durationMinutes: 20 } } };
const both = { ...current, nextPlan: { effectiveFrom: '2026-10-04', plan: future } };
const saved = () => Response.json({ ok: true, response: 'Saved and verified.', savedPlanVerified: true, plan: both, pendingPlanRequest: '' });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const event = { preventDefault() {} };

async function send(h, text) {
  h.render().setInput(text);
  await h.render().send(event);
  return h.render();
}

test('verified save immediately updates both weeks without an additional GET or sign-out', async () => {
  const requests = [];
  const h = hub(async (_, init) => { requests.push(init.method); return saved(); });
  const state = await send(h, 'Create next week workouts');
  assert.deepEqual(requests, ['POST']);
  assert.equal(state.plan.planId, 'current');
  assert.equal(h.helpers.nextSavedPlan(state.plan).planId, 'next');
  assert.equal(h.helpers.workoutMap(state.plan)['same-id'].durationMinutes, 20);
  assert.equal(h.helpers.workoutMap(h.helpers.nextSavedPlan(state.plan))['same-id'].durationMinutes, 60);
  assert.equal(state.status, 'Saved and verified in My Workouts.');
});

test('read/validation actions without savedPlanVerified never display a saved status', async () => {
  const h = hub(async () => Response.json({ ok: true, response: 'Existing plan', relaySource: 'action-final-delivery', actionMode: 'get_plan' }));
  const state = await send(h, 'Show my workouts');
  assert.equal(state.status, '');
  assert.equal(state.plan, null);
});

test('an in-flight pre-save GET cannot replace the newer verified response', async () => {
  let finishOldRead;
  const h = hub(async (_, init) => init.method === 'GET'
    ? new Promise((resolve) => { finishOldRead = resolve; }) : saved());
  const read = h.render().loadPlan();
  await send(h, 'Create next week workouts');
  finishOldRead(Response.json({ ok: true, plan: current, historyEntries: [] }));
  await read;
  const state = h.render();
  assert.equal(h.helpers.nextSavedPlan(state.plan).planId, 'next');
  assert.equal(state.planLoading, false);
});

test('out-of-order GET responses keep the newest requested plan', async () => {
  const finishes = [];
  const h = hub(async () => new Promise((resolve) => finishes.push(resolve)));
  const a = h.render().loadPlan();
  const b = h.render().loadPlan();
  finishes[1](Response.json({ ok: true, plan: both })); await b;
  finishes[0](Response.json({ ok: true, plan: current })); await a;
  assert.equal(h.helpers.nextSavedPlan(h.render().plan).planId, 'next');
});

test('opening My Workouts performs an automatic no-store read', async () => {
  const requests = [];
  const h = hub(async (_, init) => { requests.push(init); return Response.json({ ok: true, plan: both }); });
  h.render().setTab('workouts'); h.render();
  const effect = h.effects().find((entry) => entry.deps?.length === 1 && entry.deps[0] === 'workouts');
  assert.ok(effect);
  effect.fn(); await tick();
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].cache, 'no-store');
  assert.equal(h.helpers.nextSavedPlan(h.render().plan).planId, 'next');
});

test('returning to a visible tab refreshes data without a model request', async () => {
  const requests = [];
  const h = hub(async (_, init) => { requests.push(init.method); return Response.json({ ok: true, plan: both }); });
  const refresh = h.effects().find((entry) => entry.fn.toString().includes('refreshVisiblePlan'));
  const cleanup = refresh.fn();
  h.events.get('focus')(); await tick();
  assert.deepEqual(requests, ['GET']);
  assert.equal(h.helpers.nextSavedPlan(h.render().plan).planId, 'next');
  cleanup();
  assert.equal(h.events.has('focus'), false);
});

test('pending plan context reaches the follow-up and is cleared on a new chat', async () => {
  const bodies = [];
  const h = hub(async (_, init) => {
    bodies.push(JSON.parse(init.body));
    return Response.json({ ok: true, response: 'Which equipment?', savedPlanVerified: false, pendingPlanRequest: 'Create next week M-F 60 min each' });
  });
  await send(h, 'Create next week M-F 60 min each');
  await send(h, 'Do your best to guess');
  assert.equal(bodies[1].pendingPlanRequest, bodies[0].message);
  h.render().newChat();
  assert.equal(h.render().pendingPlanRequest, '');
});

test('completion keys separate reused workout IDs across calendar weeks', () => {
  const h = hub(async () => { throw new Error('No request expected'); });
  assert.notEqual(h.helpers.completionKey('otf', '2026-09-28'), h.helpers.completionKey('otf', '2026-10-05'));
});

test('escaped model markdown is cleaned instead of exposing slash-star formatting', () => {
  const h = hub(async () => { throw new Error('No request expected'); });
  assert.equal(h.helpers.cleanCoachText('\\*\\*Hotel Workout\\*\\*'), 'Hotel Workout');
});
