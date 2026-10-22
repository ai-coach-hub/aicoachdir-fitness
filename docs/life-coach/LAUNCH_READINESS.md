# AI Coaching for Life - Launch Readiness (private)

Updated: 2026-10-21
Status: PREPARATION ONLY - NOT APPROVED FOR PUBLIC RELEASE
Work branch: feature/life-coach-agent-sandbox-20261011
Pull request: #175 (must remain DRAFT until all blocking conditions are satisfied)
Preview: https://aicoachdir-fitness-git-feature-life-coach-agent-san-2628da-kcb3.vercel.app/life

## Non-negotiable release boundary

Life Coach is currently available only to explicitly approved, verified Clerk members in the Vercel Preview environment. Its server entry point uses lifeTester() in lib/lifeCoachAccess.ts, which rejects VERCEL_ENV other than preview. The allowlist is LIFE_COACH_TESTER_EMAILS; ownership of all saved data is the stable Clerk user.id. The private database uses LIFE_COACH_DATABASE_URL, not shared live Fitness or Budgeting storage.

Do not merge this PR, promote a deployment, add a homepage Life Coach CTA, create checkout products, or enable production access until the owner explicitly approves the full rollout. The Preview URL should remain stable even as new private commits are deployed. The real-account separation check below remains outstanding. Do not request paying members to test.

## Confirmed working in private Preview

- Successful authenticated retrieval of an earlier time-management goal from Neon, then retrieval in normal chat.
- Natural question: "Can you help me make progress on the goal we discussed?" retrieved that goal and offered a specific next action without a Pickaxe request.
- A seven-day time-management plan was generated with the coach and displayed cleanly; saved older Markdown replies are formatted at display time.
- GitHub CI includes Life Coach safety, formatting, private memory, and simulated two-member isolation regression cases.
- The automated two-member test checks thread listing, cross-member reads, recall, forged member IDs, cross-member writes, and model-bound history. No real Pickaxe credits were used by those synthetic tests.
- Database constraints: life_chat_threads keyed by (member_id, id) and life_chat_messages referencing (member_id, conversation_id).
- On 2026-10-21 a read-only audit found two distinct Clerk-format owner identifiers in the private Neon branch (9 and 12 threads); no personal IDs, messages or email addresses were exported. Two authenticated browser sessions have **not** yet been verified against the current build, so the two-real-Clerk-account test has NOT passed yet.
- Read-only owner-scoped database queries returned zero foreign threads or messages in both A-to-B and B-to-A directions. This is a database-layer result, not proof of end-to-end Clerk session isolation.
- The private store now verifies the exact Neon branch before table setup or member reads/writes, and rejects non-sandbox Vercel deployments. Automated wrong-branch tests run without any model requests.

## Current live membership - preserve completely

- Existing live membership shown on the site: $15/month, Fitness + Budgeting, with My Workouts and My Budget; 400 shared AI uses per month. No separate Budgeting checkout. The existing entitlement/checkout/webhook implementation must not be changed to launch this Preview.
- Existing active, cancel-at-period-end, paid-through, recoverable/lapsed, restored old Pickaxe accounts, and returning subscribers must keep their currently supported treatment and their saved conversations.
- **Approved 2026-10-22:** Existing eligible $15/month members, including verified older paid subscribers, receive Life Coach along with Fitness and Budgeting **within the same 400 monthly AI uses**, at no additional charge, with the original subscription, account, history and cancellation/reactivation preserved. This is a product-policy approval, NOT a claim that shared metering or public entitlement enforcement is deployed.
- The code currently uses shared memberHasFitnessAccess() for live Fitness/Budgeting. Life membership is now approved in principle, but a new production Life Coach route MUST independently verify the current member, keep legacy access parity, and enforce one combined 400-use meter across Fitness, Budgeting and Life before enabling paid generation. Old/renewing/cancel-at-period-end members must not lose valid access or receive a second wallet.
- Do not claim unused tracker page visits consume AI credits. Distinguish chat/model requests from non-AI page views; verify total-usage metering across coach providers before sharing a new allowance.

The newer pricing direction is a single all-coach membership with four usage tiers (Starter, Standard, Plus, Pro). See ../membership/FOUR_TIER_ALL_ACCESS_PLAN.md. The older nine-combination bundle document is retained only as historical context; no prices or usage allowances are approved.

## Stripe catalog inventory - read-only inspection, not a pricing decision

On 2026-10-12, the connected live Stripe catalog returned 11 active product records and 14 active recurring monthly price records. There are older Basic/Growth/Pro catalog entries referring to Career-only, FitLife/Fitness+Life, and All Four Coaches, plus a separate current "AI Fitness Coach 2.0" $15 recurring price. The older price entries range from $9 to $39 in that catalog. Catalog "active" means selectable in Stripe; it does not prove currently sold, subscribed to, connected to the website, or approved for a new launch.

The owner has discussed a three-bundle x three-tier model before, but the exact bundle lineup and amounts have evolved. Do NOT auto-create, delete, archive, or reuse old catalog prices by name. Before any launch billing change:
1. Map the CURRENT live price and each Stripe subscription lineage to its actual entitlement; do not disturb historic subscribers.
2. Confirm the desired bundle families, included coaches, tier names, prices, included shared AI usage, and which benefits existing $15 members retain. Budget-only versus Career-only as a bundle family is unresolved and must be expressly approved.
3. Audit actual Pickaxe costs and model usage per coach to price each tier profitably.
4. Implement explicit server-authoritative entitlements for the approved Life Coach plan. Reuse the same Clerk identity and existing subscriber record, with clear cancellation, recovery and upgrade/downgrade rules and no duplicate charges.
5. Verify checkout, webhooks, pricing copy, legal assent, and cancellations in test mode before any live Stripe edits.

## Latest private sandbox privacy evidence (2026-10-21)

- Verified Vercel Preview on the exact sandbox branch, never the live production alias. Test access requires the signed-in Clerk user's verified primary email to be on the private preview allowlist.
- The dedicated Neon branch reported 2 Clerk-format conversation owners and a total of 21 threads and 46 messages. These counts **do not** establish that both users successfully tested this current preview through independent authenticated sessions.
- In read-only SQL, the exact member-scoped queries used by the chat store returned 0 cross-account thread or message matches in either direction.
- The store now independently checks the Neon branch identity before executing reads or writes. In mocked-branch-mismatch regression tests, both GET and POST fail without accessing chat data.
- No messages, account identifiers, secrets, live Stripe records, provider calls or production database rows were included in this audit. No Pickaxe generation was used.
- **Completed:** Two independently authenticated Clerk sessions passed the zero-credit private cross-account check. Additional goal-recall and broader production safeguards remain separate launch requirements.

### Zero-credit authenticated verification (private preview)

The sandbox now exposes `/life/privacy-check` for approved, verified internal Clerk testers. Each tester signs in separately and clicks **Run zero-credit privacy check**. The server derives identity from Clerk, verifies the Neon branch, enumerates only that member's thread list, and confirms a different test account's conversation cannot be read through the member-scoped store. It does not call Pickaxe, perform checkout, expose the foreign conversation ID, or access the production database.

A successful check records only the authenticated Clerk member ID, passing status and timestamp in the private `life_privacy_test_checks` table. Two different accounts must each pass within 48 hours to mark `twoAccountCheckComplete: true`. Repeated checks by a single account never count as a second session. This page streamlines the **real authenticated session** part of the release gate; the owner should still confirm each account's own historical goal is correct and not the other's using the zero-model memory pathway. Do not change the gate to passed until two sessions have actually run the check.

## Two-account authenticated privacy check — VERIFIED (2026-10-21)

- Two distinct approved Clerk test accounts successfully submitted the zero-credit privacy check using separate authenticated sessions in the private Life Coach preview.
- The private Neon `life_privacy_test_checks` table independently confirms **2 distinct successful account checks** within 48 hours (verified on 2026-10-21); the user-facing check displayed **2 of 2**.
- Each check reported the requesting member's own history scoped correctly and access to a different account's conversation denied. No Pickaxe completion request was made by the privacy-check endpoint.
- The earlier simulated cross-account tests and GitHub CI also passed.
- **Real authenticated two-account privacy-check gate: PASSED.** This does not by itself certify all production privacy, paid access, complete memory recall, or launch readiness. Other release blockers below remain active.
- Temporary second tester email remains authorized in the private preview only until further QA concludes, then it should be removed from the preview allowlist. No production login or billing configuration changed.

## Dedicated internal real-account privacy check - VERIFIED; ADDITIONAL RELEASE CHECKS OPEN

Do not involve any existing paying customer. The prior signup test email did not work; don't force that path again.

When a second-account check is ready:
1. Create a dedicated company-owned test account in the correct existing Clerk instance through the Clerk dashboard's user-management / invitation controls, rather than the public signup journey. Use a separate controlled inbox and complete primary-email verification. Never share passwords or bypass verification.
2. Add only that verified primary email to the Life Coach test allowlist scoped to Vercel Preview and the private Life Coach branch, leaving all production environment values alone. This test must not purchase a subscription.
3. Sign in as member A and member B in separate browser sessions. Create an original, nonsensitive memory fact for B; do not use real customer conversations in testing.
4. As B, verify Previous Chats lists only B's threads and GET /api/life/chat returns only B's records. Opening A's conversation ID must return 404, not 200. Requesting A's goal must not surface A's data.
5. As A, verify B's conversation ID also returns 404 and B's goal cannot be recalled. Verify signed-out and disallowed accounts receive 403 from the private chat API.
6. Test a short factual recall through the website only. Do not invoke Pickaxe for these checks. Use the saved goal / direct-memory path, not a generation request.
7. Record pass/fail in the PR; never include full personal conversation contents or production secrets in testing notes. Remove the temporary email from the allowlist when testing ends.

Automated simulated-account tests are necessary, but do not substitute for this real Clerk integration check.

## Additional production-readiness requirements - BLOCKING

- Identity/entitlement: approved Life Coach purchase or grandfathering policy, server-side paid-access validation on every GET and POST; no self-attested user ID or email from the browser.
- Database: create proper production migration and production-scoped LIFE_COACH_DATABASE_URL; remove per-request CREATE TABLE DDL before scale-up; keep stable account identity and member-scoped reads/writes.
- Metering: apply the chosen shared-use or separate-use allowance consistently to Life Coach and other coach chats; verify budget/fair-use behavior and cost reports before accepting new payments. Do not count simple Neon-only recall as a Pickaxe model call.
- Reliability: handle timeouts, duplicate sends, partial persistence failures, plan renewals/cancelations, stale Preview URLs, old conversations, and failed provider replies without silently losing user history. Verify end-to-end with the correct environment.
- Privacy and security: ensure historic text is treated as untrusted data, secure retention/deletion design, age 18+ and AI limitations language, user-facing disclosure of AI/model providers, and no cross-coach action or data leak.
- Safety and quality: test supportive handling of crisis/self-harm messages, clear referral on medical/legal/financial requests, honest capabilities, and natural helpful coaching without Markdown artifacts or placeholders.
- UX: one-login return path, responsive layout, new-chat list, error handling, accessible formatting, and accurate public pricing and CTA copy.
- Change control: inspect conflicts against latest main before merge (private branch may lag), require green CI and a Preview build that matches the approved commit, retain rollback path. Never equate "Preview READY" with "production accepted."

## Rollout proposal - no automatic changes

Phase A: Keep Life Coach private, run the internal second-member test, and finish production entitlement/metering design.
Phase B: Owner approves exact pricing/bundle scope and legacy treatment; test all plan transitions and legal copy without a live charge.
Phase C: Stage a production-shaped build without public exposure; complete quality, safety, and recovery checks.
Phase D: Obtain separate explicit owner approval, then release only the approved member offering. Watch early cost/errors. Roll back safely on regressions.

Release status today: NOT READY TO MERGE OR PUBLISH. The remaining gates are intentional and protect existing members and live billing.

## Owner-approved legacy Life Coach access (2026-10-22)
The owner explicitly approved giving **all existing paid $15/month subscribers**
Life Coach access at **no added charge**, within their existing **400 total AI
uses per billing month across Fitness, Budgeting and Life**. This extends the
approved coach set without changing the price, usage cap, ledger identity,
existing subscriber period or account, saved data or cancellation rights.
Career remains unreleased and is not included by this decision.

Policy is implemented in the private pure mapping module
`lib/legacyLifeCoachEntitlement.ts` and its regression test. This is **not a
production activation**: existing membership and webhook verification and
all-coach shared atomic metering must still be connected and tested. Never
interpret the policy module alone as proof of paid membership. Preserve the
current allowed live coaches until that migration is ready, and do not
create a second Stripe subscription or second monthly allowance.

The provisional four-tier plan remains unpriced and unapproved. Its future prices do not supersede the approved Life Coach inclusion for existing members.
