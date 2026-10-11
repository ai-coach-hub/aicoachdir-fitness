import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import vm from "node:vm";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import ts from "typescript";

// Loaded the way the other route tests load it: transpiled, run in a sandbox that allows only known imports.
const source = await readFile(new URL("../app/api/fitness/chat/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source + "\nmodule.exports.__test = { settleWorkoutSaveRace, clarificationFromDriver };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module_ = { exports: {} };
vm.runInNewContext(compiled, {
  module: module_, exports: module_.exports, console, Request, Response, Headers, URL, AbortSignal, AbortController,
  Date, Intl, Buffer, crypto, setTimeout, clearTimeout, process: { env: {} },
  fetch: async () => { throw new Error("Unexpected network request"); },
  require: (name) => {
    if (name === "node:crypto") return crypto;
    if (name === "node:util") return { isDeepStrictEqual };
    if (name === "@clerk/nextjs/server") return { currentUser: async () => null };
    if (name === "@/lib/memberIdentity") return { canonicalMemberEmail: (email) => email };
    if (name === "@/lib/fitnessMembershipDb") return { memberHasFitnessAccess: async () => false };
    throw new Error("Unexpected import: " + name);
  },
}, { timeout: 5000 });
const { settleWorkoutSaveRace, clarificationFromDriver } = module_.exports.__test;
// Objects made inside the sandbox have its prototypes; compare their content.
const plain = (value) => JSON.parse(JSON.stringify(value));

// A promise the test resolves by hand, so the order of the race is chosen, not timed.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const never = () => new Promise(() => {});
const QUESTION = "How long can each session be? Any joint pain I should know about?";
const NO_SAVE = { finalDelivery: "", runCount: 0 };
const SAVED = { finalDelivery: "Plan saved.", runCount: 1 };

test("the save poll ends with nothing saved, then the coach asks a question: the member gets the question", async () => {
  // Production 2026-10-07: the poll window ended first and the coach's questions were discarded (a 504).
  const relay = deferred();
  const driver = deferred();
  const settled = settleWorkoutSaveRace({ pendingRelay: relay.promise, driver: driver.promise });
  relay.resolve(NO_SAVE);
  await new Promise((r) => setTimeout(r, 10));
  driver.resolve({ ok: true, text: QUESTION });
  assert.deepEqual(plain(await settled), { relay: NO_SAVE, clarification: QUESTION });
});

test("a verified save wins: no clarification, and the coach's answer is not waited for", async () => {
  const settled = await settleWorkoutSaveRace({ pendingRelay: Promise.resolve(SAVED), driver: never() });
  assert.deepEqual(plain(settled), { relay: SAVED, clarification: "" });
});

test("the poll ends with nothing saved and the coach fails: no clarification, so the route still answers 504", async () => {
  const settled = await settleWorkoutSaveRace({ pendingRelay: Promise.resolve(NO_SAVE), driver: Promise.resolve(undefined) });
  assert.deepEqual(plain(settled), { relay: NO_SAVE, clarification: "" });
});

test("the coach answers first and no save follows: the question is kept, relay left as it was", async () => {
  const settled = await settleWorkoutSaveRace({ pendingRelay: never(), driver: Promise.resolve({ ok: true, text: QUESTION }),
                                                lateRelayWindowMs: 20 });
  assert.deepEqual(plain(settled), { relay: null, clarification: QUESTION });
});

test("the coach answers first and a save lands inside the late window: the save is picked up", async () => {
  const relay = deferred();
  const settled = settleWorkoutSaveRace({ pendingRelay: relay.promise, driver: Promise.resolve({ ok: true, text: "Done." }),
                                          lateRelayWindowMs: 200 });
  setTimeout(() => relay.resolve(SAVED), 10);
  assert.deepEqual(plain(await settled), { relay: SAVED, clarification: "" });
});

test("the clarification filter is unchanged: only an ok answer that asks something and claims no save", () => {
  assert.equal(clarificationFromDriver({ ok: true, text: `  ${QUESTION}  ` }), QUESTION);
  assert.equal(clarificationFromDriver({ ok: true, text: "Your plan is saved. Want another?" }), "");
  assert.equal(clarificationFromDriver({ ok: true, text: "Here is your plan." }), "");
  assert.equal(clarificationFromDriver({ ok: false, text: QUESTION }), "");
  assert.equal(clarificationFromDriver({ ok: true, text: "APPLICATION SAVE RULES: which day?" }), "");
  assert.equal(clarificationFromDriver(undefined), "");
});

test("the chat route settles the save race through settleWorkoutSaveRace", () => {
  assert.match(source, /await settleWorkoutSaveRace\(\{ pendingRelay, driver: mutationDriverPromise \}\)/);
  assert.doesNotMatch(source, /firstMutationResult/);
});
