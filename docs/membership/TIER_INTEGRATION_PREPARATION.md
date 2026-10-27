# AI Coach Directory — Four-Tier Integration Preparation

Status: DRAFT / non-live. No production billing, access, wallets, or Pickaxe groups changed.

## Verified current behavior
- The website's new-subscriber flow uses its existing $15/month Stripe subscription price. The checkout and membership webhooks currently call the same Pickaxe access-grant function for every member.
- The access-grant function uses the existing Pickaxe group ID `access-b232b0a3-4713-45b4-a7ab-3daba2faa4d9`; group settings shown by the owner have 400 uses/month, enabled $15 monthly monetization, 13 members, three deployments and one portal.
- The existing shared-usage resolver is pinned to a 400-message entitlement; the Budgeting application has a separate signed handoff, so one consolidated allowance across all provider paths needs explicit verification.
- No safe conversion should modify the legacy Pickaxe group, move its members, or expose the existing Pickaxe portal's paid Get option without checking how website Stripe billing and historic Pickaxe billing interact.

## Owner-approved tier names and unapproved economics
Starter ($9/100 uses), Growth ($15/400), Premium ($25/700), Elite ($39/1200). Prices and higher caps remain **illustrative** until provider costs are validated. All available coaches and saved-work tools would be available on every plan.

## Prepared website-side contract
The standalone `lib/membershipTierDraft.mjs` module holds the four candidate names and limits and validates an explicit list of four unique Stripe Price IDs mapped to four new, distinct Pickaxe group IDs. Unknown IDs fail closed. It cannot update subscriptions, assign a group, or mint usage. It deliberately does not alter the existing 400-use group. The test suite checks draft labels, mapping uniqueness, and legacy protection.

No production routes import this draft. The current public $15/400 checkout remains the only current offer.

## Next engineering order, with release gates
1. Obtain actual per-request cost distribution across Fitness, Budgeting and Life (including internal tool calls/retries), payment fees and fixed Pickaxe/Vercel expenses. Model expensive/high-utilization cases before approving limits.
2. Perform read-only reconciliation of website Stripe and historic Pickaxe subscriptions; establish which existing portal Get buttons might charge members and distinguish group access from billing.
3. Verify one centralized wallet truly governs all three coach completion paths, while read-only saved work never spends messages. Address concurrency, idempotency, billing periods, cancellation, and future upgrades.
4. In isolated test/sandbox configuration only, prepare four distinct Pickaxe tier groups and four Stripe products/prices. Do not reassign active group members. Never turn on additional Pickaxe recurring payments without explicit authority.
5. Add a server-verified plan-to-entitlement adapter, using authenticated Clerk identity plus verified Stripe subscription and price. Ensure no new wallet is issued midcycle and unknown prices cannot unlock higher limits.
6. Test the full upgrade/downgrade/reactivation lifecycle using synthetic accounts and protected preview environments. Keep the approved existing member entitlement and saved history.
7. Obtain separate explicit approval before showing prices publicly, enabling tier purchases, changing production access groups, or activating the new adapter.

## Release constraint
This preparation is strictly non-live. Existing subscribers and their $15/400 membership remain intact. Tax decisions remain deferred until counsel review.

## October 26 conservative cost stress test (non-live)
The earlier 100/400/700/1200 tier counts are **rejected as launch candidates** under observed-cost uncertainty, but intentionally remain in the original `PROPOSED_TIERS` structure to preserve existing preliminary tests and show what failed. The newer `membershipStressTestDraft.mjs` isolates alternative **draft only** caps, not wired into billing or checkout:

| Tier | Price/mo | Candidate messages/mo | Margin at full use |
|---|---:|---:|---:|
| Starter | $9 | 40 | 38.2% |
| Growth | $15 | 80 | 35.1% |
| Premium | $25 | 140 | 35.9% |
| Elite | $39 | 220 | 37.4% |

Model assumptions: $0.10 AI expense per **member-visible completed message** (sensitivity assumption, not validated production cost or ceiling), 2.9% + $0.30 payment fees, $1/member/month fixed overhead, and minimum 30% contribution margin at 100% usage. Cost is not necessarily 1:1 with the backend Pickaxe run counts. If AI costs rise to $0.14 per message all four candidates fail the 30% margin gate. Real effective costs from Fitness/Budgeting/Life, retries, historical renewal fees and actual fixed overhead must be reconciled before launch.

**Business constraint:** A new $15/80 Growth plan is far less generous than existing $15/400 subscriptions. This may be commercially unattractive and should not be launched just because it passes a stress test; compare higher prices, subscriptions with monthly fair use and explicit hard caps, and optimizing AI spend without reducing quality.

**Legacy lock:** Existing paid subscribers retain $15/month and 400 shared messages per month, with no automatic migration, repricing, reduced quota, new Stripe subscription, or Pickaxe role change. All four-tier price and allowance amounts require fresh approval. No tax setting changed.
