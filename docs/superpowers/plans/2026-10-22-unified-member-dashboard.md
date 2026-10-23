# Unified Member Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a premium, image-led single-login member dashboard where entitled members launch coaches and companion tools without selecting separate login accounts.

**Architecture:** Keep existing Clerk and server-side membership authorization. Introduce a protected dashboard and a small navigation/access model while retaining the old deep-link and billing handlers. Update the public entry points and login defaults, with Life and shared usage still controlled by existing release gates.

**Tech Stack:** Next.js App Router, React, TypeScript, Clerk, existing membership/Stripe integration, Vercel, node:test.

**Spec:** `docs/superpowers/specs/2026-10-22-unified-member-dashboard-design.md`

## Global Constraints

- One member login, existing Clerk identity and `memberHasFitnessAccess`; never add another payment/auth gate.
- Visual theme: dark navy, electric-green accents, image-led premium cards using existing brand artwork.
- Fitness and Budgeting remain available, and My Workouts/My Budget link to their real tools.
- Life only appears actionable after member-specific eligibility and the full production release; no shared-meter or Life gate changes.
- Preserve subscriptions, Terms acceptance, legacy reactivation, chat/workout/budget data, prior bookmarks and destination redirects.
- Preview first; no production promotion until regression, build, responsive and access tests pass.

## Review Focus

1. Unverified or missing Clerk primary email: dashboard fails closed; no secondary subscription checkout prompt.
2. Temporary membership database/provider error: show retry and retain session rather than labeling a paid member expired.
3. Legacy `destination=budget-coach`/tracker and manage-subscription links: retain explicit destination redirects.
4. Rolling-renewal member before cutover: Fitness/Budgeting remain usable, but Life is not falsely offered.
5. Unauthenticated deep links and expired/canceled memberships: original authorization remains enforced and no saved data is cleared.

---

### Task 1: Shared dashboard access policy

**Files:**
- Create: `lib/memberDashboardAccess.ts`
- Test: `tests/member-dashboard-access.test.mjs`

**Interfaces:**
- Produces `getDashboardMemberState():Promise<{status:"signed_out"|"active"|"inactive"|"error";displayName:string;lifeState:"available"|"at_renewal"|"unavailable"}>`.
- Consumes: `currentUser`, verified email and `memberHasFitnessAccess`, current Life release/migration gates.

- [ ] **Step 1:** Write failing tests for missing user, missing/unverified email, active member, expired member, lookup exception and Life rolling release state. Assert no user-controlled email/flag can grant access.
- [ ] **Step 2:** Run `node --test tests/member-dashboard-access.test.mjs`; expect failures before implementation.
- [ ] **Step 3:** Implement the typed state resolver in `lib/memberDashboardAccess.ts` using existing server authorization and Life eligibility; do not change the membership database.
- [ ] **Step 4:** Re-run focused tests; expect PASS.
- [ ] **Step 5:** Commit access policy and tests.

### Task 2: Premium member dashboard

**Files:**
- Create: `app/dashboard/page.tsx`, `app/dashboard/dashboard.module.css`, `components/MemberDashboardCards.tsx`
- Test: `tests/member-dashboard-page.test.mjs`

**Interfaces:**
- Consumes Task 1 `getDashboardMemberState()`.
- Coach URLs: `/fitness/chat`, `/budgeting/launch?destination=coach`, `/life` only when Life eligible.
- Tool URLs: My Workouts via existing Fitness chat/My Workouts view, My Budget `/budgeting/launch?destination=tracker`.

- [ ] **Step 1:** Write tests asserting active-only page, correct coach and tool URLs, no second-login links, explicit Life withheld/renewal status, signed-out redirect and retryable membership-error state.
- [ ] **Step 2:** Run `node --test tests/member-dashboard-page.test.mjs`; expect failures.
- [ ] **Step 3:** Build server-rendered /dashboard with welcome, image-rich coach cards and a separate smaller tools section; use existing image assets and mobile-first CSS 3/2/1 responsive grid, keyboard focus, sufficient contrast and reduced-motion support.
- [ ] **Step 4:** Run focused tests and Next.js type-check; expect PASS.
- [ ] **Step 5:** Commit dashboard, styles and tests.

### Task 3: Single login and homepage navigation

**Files:**
- Modify: `app/page.tsx`, `components/SiteHeader.tsx`, `app/fitness/login/page.tsx`, `components/FitnessMemberLoginClient.tsx`, `app/layout.tsx`
- Test: `tests/member-dashboard-entry.test.mjs`
- Modify: `tests/member-entry-gates.test.mjs` only where previous copy expectations changed.

**Interfaces:**
- Default member login `/fitness/login` -> `/dashboard` after verified access.
- Preserve explicit destinations and `destinationPath` for `fitness`, `budget-coach`, `budget-tracker`, `manage-subscription`.

- [ ] **Step 1:** Add failing tests for single universal member login CTA, removed per-coach login buttons, member status CTA in login, and default redirect to /dashboard.
- [ ] **Step 2:** Run `node --test tests/member-dashboard-entry.test.mjs tests/member-entry-gates.test.mjs`; expect FAIL.
- [ ] **Step 3:** Update public homepage and header to one Member Login and separate signup, preserve coach discovery, and update signed-in login behavior and Clerk fallback to the new dashboard. Explicit destinations continue to their existing handlers.
- [ ] **Step 4:** Re-run focused tests and type-check; expect PASS.
- [ ] **Step 5:** Commit entry flow changes.

### Task 4: Navigation continuity without breaking saved work

**Files:**
- Modify: `app/fitness/chat/page.tsx` (small targeted nav control only)
- Modify: `app/life/page.tsx` (return link destination only)
- Consider existing Budgeting navigation component in separate repository only after inspecting its authenticated return flow.
- Test: `tests/member-dashboard-navigation.test.mjs`

**Interfaces:**
- Each coach/tool can return to `/dashboard` without signing out. Existing budget launch signed HMAC handoff untouched.
- Existing authenticated deep-link destination semantics unchanged.

- [ ] **Step 1:** Test dashboard-return navigation, budget handoff preservation, unsaved local state behavior and old deep-link authorization; no storage reset.
- [ ] **Step 2:** Run `node --test tests/member-dashboard-navigation.test.mjs`; expect FAIL.
- [ ] **Step 3:** Add narrow dashboard-return navigation and preserve all existing saving/history APIs; only patch Budgeting repo after separate scoped tests if needed.
- [ ] **Step 4:** Run focused tests plus `node --test tests/member-entry-gates.test.mjs`; expect PASS.
- [ ] **Step 5:** Commit navigation work.

### Task 5: Preview readiness and release evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-10-22-unified-member-dashboard-design.md` status and implementation verification notes.
- Test: all existing regression tests, TypeScript and Vercel build.

- [ ] **Step 1:** Run `npm test` or repo's documented test script and `npx tsc --noEmit`; record precise failures, and distinguish pre-existing failures from this branch.
- [ ] **Step 2:** Obtain Vercel Preview READY build on a feature branch, without changing production aliases, release flags or payment settings.
- [ ] **Step 3:** Verify active/legacy/canceled/past-due/rolling/signed-out journeys, mobile sizes and keyboard navigation. Preserve old production deployment rollback candidate.
- [ ] **Step 4:** Submit PR with test and preview evidence; do not merge to production before review and release checks.
