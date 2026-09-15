# Pickaxe Workout Plan Read Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Vercel read endpoint that uses the existing signed `_historyBridge` capability to fetch the signed-in member's canonical workout plan from Pickaxe, then wire only the beta My Workouts page to use it first.

**Architecture:** Pickaxe remains the source of truth. The beta page extracts only `_historyBridge` authorization fields from already-authenticated Pickaxe page context and POSTs them to `/api/pickaxe/workout-plan`; Vercel verifies the HMAC with the server-only workspace token, reads that exact member's Pickaxe plan/history memory server-side, normalizes the active plan (including effective `nextPlan.plan` promotion), and returns the clean plan. Existing browser-memory parsing remains a fallback during beta testing.

**Tech Stack:** Next.js 16 route handlers on Vercel, TypeScript, Node `crypto`, Pickaxe workspace REST API, React/Vite Pickaxe Buildable App Page.

**Spec:** Approved in ChatGPT on 2026-09-15: Option A, beta-only first, reuse existing `_historyBridge` capability.

## Global Constraints

- Do not change the live My Workouts page.
- Do not change the AI Fitness Coach plan-save behavior.
- Do not expose the Pickaxe workspace API key to browser code.
- Authorize reads only after verifying the existing HMAC capability for email + planId + planUpdatedAt.
- Return only the requested member's workout plan and normalized history needed by the beta page.
- Keep the existing browser-memory path as a temporary fallback until beta verification succeeds.

---

### Task 1: Server-side signed workout-plan reader

**Files:**
- Create: `app/api/pickaxe/workout-plan/route.ts`
- Create: `app/api/pickaxe/workout-plan/route.test.ts` if the repo test runner supports route-level tests; otherwise add a pure helper test colocated with the endpoint using the existing test convention.

**Interfaces:**
- Consumes: POST JSON `{ auth: { email, planId, planUpdatedAt, signature } }` from the beta page.
- Produces: HTTP 200 `{ ok: true, plan, entries }` for the verified member; 4xx for malformed or unauthorized requests; 5xx for Pickaxe/server failures.

- [ ] **Step 1: Write a failing authorization test**
  - Valid signature for the wrong member must be rejected.
  - Invalid signature must be rejected before any Pickaxe memory read.

- [ ] **Step 2: Run the targeted test and confirm RED**

- [ ] **Step 3: Implement HMAC verification using the existing workspace token**
  - Match the current `_historyBridge` message format: `email + "\n" + planId + "\n" + planUpdatedAt`.
  - Use constant-time comparison.

- [ ] **Step 4: Write a failing plan-resolution test**
  - Reproduce a stored envelope containing an older outer plan plus `nextPlan: { effectiveFrom, plan }` where the effective date has arrived.
  - Expected result is `nextPlan.plan` as the active plan.

- [ ] **Step 5: Run and confirm RED**

- [ ] **Step 6: Implement server-side Pickaxe reads**
  - Resolve plan and history memory definitions.
  - Read only the verified member email.
  - Accept stored wrappers under `value`, `memoryValue`, or `memory_value`.
  - Resolve candidates under `plan`, `currentPlan`, `workoutPlan`, and the raw record.
  - Promote effective `nextPlan.plan` independently when its `effectiveFrom` date is current or past.
  - Match the verified capability's plan ID/timestamp against either the outer or promoted plan as appropriate.

- [ ] **Step 7: Run targeted tests and confirm GREEN**

### Task 2: Beta page server bridge

**Files:**
- Modify: Pickaxe beta page `src/App.jsx`
- Modify/Create: `src/lib/workoutPlanBridge.js`
- Test: isolated beta-page bridge tests in the working package.

**Interfaces:**
- Consumes: `_historyBridge` object discovered in authenticated Pickaxe context memory values.
- Produces: normalized plan returned from `https://aicoachdir.com/api/pickaxe/workout-plan`.

- [ ] **Step 1: Write a failing beta bridge test**
  - Context contains a signed bridge but the local parser cannot resolve a plan.
  - Expected: bridge client calls the Vercel endpoint and returns the plan.

- [ ] **Step 2: Run and confirm RED**

- [ ] **Step 3: Implement the bridge client**
  - POST only `{ auth }`.
  - Use `credentials: "omit"`; authorization is the signed capability, not cookies.
  - Fail closed on non-200/invalid JSON.

- [ ] **Step 4: Wire bridge-first hydration into beta App**
  - Use the server result before declaring "No workout plan saved yet".
  - Keep existing local memory resolution as fallback.
  - Do not alter workout rendering, completion tracking, or coach links.

- [ ] **Step 5: Run beta regression suite and confirm GREEN**

### Task 3: Packaging and beta deployment verification

**Files:**
- Generate: Pickaxe-ready ZIP containing only app files.

**Interfaces:**
- Produces: one ZIP to import into `My Workouts BETA – v27`.

- [ ] **Step 1: Run full server and beta regression tests**
- [ ] **Step 2: Verify ZIP contains no notes, markdown, tests, or secret files**
- [ ] **Step 3: Verify endpoint CORS allows `https://studio.pickaxe.co` and only POST/OPTIONS**
- [ ] **Step 4: Deploy endpoint from isolated branch/preview or production-safe route without changing live UI**
- [ ] **Step 5: Import/build/publish only the beta page and test in Incognito**

## Self-Review

- Spec coverage: server-side authenticated read, Pickaxe source of truth, beta-only page wiring, no coach/save changes, no live page changes are all represented.
- Placeholder scan: no TBD/TODO/implement-later steps.
- Type consistency: the only browser-to-server contract is `{ auth: BridgeAuth }`; server response is `{ ok: true, plan, entries }`.
