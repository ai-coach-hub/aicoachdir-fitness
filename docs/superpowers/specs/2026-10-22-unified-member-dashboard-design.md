# Unified Member Dashboard — Design Specification

Date: 2026-10-22
Status: Visual direction approved; specification awaiting owner review.
Repository: ai-coach-hub/aicoachdir-fitness
Scope: One-login, member-first navigation for the current Fitness, Budgeting and eligible Life Coach experiences and their companion tools. No payment, usage, or provider release policy changes.

## Purpose and outcomes

AI Coach Directory sells one membership, so members must authenticate once and see an attractive unified home instead of choosing a coach-specific login. The design should feel like a premium dark, image-led coaching platform with navy, electric-green accents, existing artwork, thoughtful hierarchy and responsive layouts. It should not look like a bland grid of generic buttons.

Success: a returning member signs in once, lands at /dashboard, selects any entitled coach or tool, navigates back to the dashboard, and can move between them without another credential prompt or Terms gate. Existing members, subscriptions, saved conversations, saved workouts, and budget data remain unchanged. Old bookmarked deep links continue working through current authorization pathways.

## Architecture and routing

Use the existing Clerk identity and server-side `memberHasFitnessAccess` checks; do not introduce a second account system or a new payment gate.

- Public `/`: prominent single "Member Login" link to `/fitness/login`; remove coach-specific login buttons; keep public descriptions/artwork and a clear "Join"/"Get Started" subscription CTA. Public coach entry CTAs may point to the same signup path but must not imply separate subscriptions.
- `/fitness/login` becomes the single login entry point. If an authenticated member has verified access and has no explicit legacy destination, redirect them to `/dashboard`; retain strict `destination` handling for existing deep links, workout editing, budget-tracker redirects, and account management. An unentitled or unverifiable member sees the current safe payment-recovery/status UI rather than a dashboard that grants access.
- Add server-rendered `/dashboard`, protected by `currentUser`, verified Clerk email and `memberHasFitnessAccess`. The dashboard links, but does not bypass any downstream access or signed Budgeting handoff checks.
- Coach links: Fitness `/fitness/chat`; Budgeting `/budgeting/launch?destination=coach`; Life `/life` only after its full public production release and the individual's entitlement. Never show Life as universally available solely because a provider credential exists. If delayed by rolling renewal, show clear non-clickable "Unlocks at renewal" status rather than a misleading live link.
- Tool links: My Workouts should use the verified existing workout route inside Fitness; My Budget uses `/budgeting/launch?destination=tracker`. Treat supplements as tools inside member navigation, not independent membership products. Future tools should be addable as configuration entries that reuse the common access policy.
- Signed-in site navigation: Dashboard / Coaches / My Tools / Account, with links to account and membership management. "Return to Dashboard" from each experience must be available without losing state. Preserve old destination query routes and current handlers for bookmarked links and during transition.
- Checkout success: default new memberships to `/dashboard` after verified activation, while preserving explicit destinations where an existing flow relies on them. Do not change Stripe records, renewal behavior, consent capture, or member access rules.

## Visual design

Dark navy foundation, controlled gradients, high-contrast text, electric-green accent used for primary calls to action and active states, and restrained surface borders/shadows. Existing high-quality Fitness, Budgeting, and Life assets lead image-rich cards. Large welcome heading, short supporting copy, a "Your Coaches" section, then a smaller "Your Tools" section for My Workouts and My Budget, plus a clear membership/account affordance. Cards feature descriptive text, genuine status (Available, Coming Soon, Unlocks at Renewal) and visible actions. Avoid duplicated login buttons or aggressive subscription calls within authenticated dashboard. Responsive 3/2/1-column card behaviors, accessible keyboard focus, contrast, and tap targets; avoid CLS-heavy media and unnecessary animation. Distinguish unavailable tools honestly.

## Data, errors, privacy and rollout

Dashboard performs server-side authorization on every request and uses no client-supplied membership claim. On auth failure redirect to the current login flow; on temporarily unavailable membership verification use a retryable error display and never convert it into a payment demand. Do not expose PII in URLs or client response. Budgeting keeps its short-lived signed handoff; history and workout storage remain unchanged. Preserve original legacy account activation and canceled/expired membership flows.

Implement behind a dedicated preview branch first, with tests and a ready Vercel preview. Production promotion only after tests for returning, new, legacy, canceled, past-due, renewal-pending and unauthenticated users; navigation across Fitness/Budgeting/tools; deep-link compatibility and mobile layout. No activation of shared 400-use meter or Life public release in the dashboard work. Keep current deployment available for rollback.

## Non-goals

No coach prompt/model changes, no pricing tiers, no provider-token changes, no database migration, no removal of working deep links, no new auth provider, and no automatic unlocking of Life or future coaches. Avoid replacing existing coach pages; provide one polished hub around them.

## Implementation acceptance checks

1. Homepage has one universal Member Login action and no coach-specific login buttons; CTA messaging remains clear for nonsubscribers.
2. Authorized sign-in without destination lands at /dashboard with Fitness, Budgeting, My Workouts and My Budget.
3. Clicking a coach or tool reaches the existing authorized handler without secondary sign-in or loss of prior state.
4. Life Coach appears as accessible only for a genuinely eligible member and only after actual public release; pre-release accounts are not misled.
5. Previously saved workouts, budget records, and chats remain untouched; legacy and subscription recovery work as before.
6. Existing direct URLs and destination redirects remain usable.
7. Tests, build, responsive QA, keyboard and mobile navigation pass before any production merge.
