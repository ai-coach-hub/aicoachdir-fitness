# AI Coach Directory - Four-Tier All-Access Membership Plan

Status: DESIGN DRAFT - NOT LIVE, NOT PRICED, NOT AUTHORIZED TO CHARGE
Date: 2026-10-12
Scope: All coaches that have actually launched, and their companion tools.
Branch: feature/life-coach-agent-sandbox-20261011, draft PR #175.

## Decision to model

Replace the earlier proposal for three bundles x three tiers (nine choices) with a straightforward **four-tier, all-access membership**. Customers buy a level of monthly coaching usage, not access to a particular coach. The working tier names are **Starter, Standard, Plus, Pro**. The four tiers share the same accessible currently launched coaches and tools; higher levels have larger total usage limits. Do not advertise unreleased coaches as available today.

This is a *design direction*, not a decision on exact prices, AI allowances, overages, or changes to existing customers.

## Historical owner-provided pricing reference (from screenshot)

The owner supplied a screenshot of an **earlier nine-option bundle concept**. Preserve these values as a historical pricing **reference**, not as live SKU entitlements or approved margins:

| Earlier package | Earlier tier | Proposed monthly price | Proposed monthly uses | Estimated AI cost in screenshot |
| --- | --- | ---: | ---: | ---: |
| Budget | Starter | $5 | 100 | $2.30 |
| Budget | Growth | $10 | 200 | $4.60 |
| Budget | Elite | $15 | 300 | $6.90 |
| Life/Fitness | Starter | $8 | 100 | $2.30 |
| Life/Fitness | Growth | $15 | 200 | $4.60 |
| Life/Fitness | Elite | $20 | 400 | $9.20 |
| All 4 Coaches | Starter | $15 | 100 | $2.30 |
| All 4 Coaches | Growth | $25 | 200 | $4.60 |
| All 4 Coaches | Elite | $30 | 400 | $9.20 |

**Cost assumption: $0.023 per counted use** ($2.30 per 100 uses) uniformly across all coach types. This is *not* validated contemporary Pickaxe cost data, and the model/provider/tool mix can make some coach requests far more expensive. The image itself cautions that the figures exclude Stripe fees, Pickaxe/Vercel overhead, taxes, etc. The commentary below the image flags that All Four Elite at $30/400 may make Growth at $25/200 unappealing: $5 more buys 200 extra uses. Do not infer any alternative price from cropped commentary.

The historical range also matters for customer acquisition: Budget started at $5 and Life/Fitness at $8. Replacing bundles with all-access should keep an attainable entry price, even though all-access has different operating cost risks.

### Initial four-tier scenario to evaluate (not approved)

Use the historical screenshot as a benchmark, smoothing the progression and replacing package restrictions with **all available coaches in every tier**.

| Proposed tier | Illustrative monthly price | Illustrative total monthly AI uses | Hypothetical AI cost at $0.023/use | Gross amount before all other fees and overhead |
| --- | ---: | ---: | ---: | ---: |
| Starter | $9 | 100 | $2.30 | $6.70 |
| Standard | $15 | 200 | $4.60 | $10.40 |
| Plus | $25 | 400 | $9.20 | $15.80 |
| Pro | $35 | 600 | $13.80 | $21.20 |

**These are illustrative only.** Prices, use limits, and the $0.023 assumption must be reevaluated after metering and provider-cost evidence. In particular, the current publicly offered $15/400 deal must not silently become $15/200: retain the original allowance and terms for current subscribers unless the owner approves a lawful and clearly communicated transition. Do not silently expand the old subscription to new coaches either; decide grandfathered coach access explicitly.

### Cost sensitivity at the *entire cap* (before processing fees and fixed costs)

| Hypothetical actual provider cost per AI use | Starter 100 | Standard 200 | Plus 400 | Pro 600 |
| --- | ---: | ---: | ---: | ---: |
| $0.023 (original screenshot) | $2.30 | $4.60 | $9.20 | $13.80 |
| $0.05 | $5.00 | $10.00 | $20.00 | $30.00 |
| $0.10 | $10.00 | $20.00 | $40.00 | $60.00 |
| $0.19 (illustrative expensive-request sensitivity, NOT an established average) | $19.00 | $38.00 | $76.00 | $114.00 |

Even at $0.05 per use, these sample tiers leave only $4, $5, $5 and $5 respectively **before** fees and overhead at full utilization. At $0.10 they are uneconomic. Actual margins depend on request mix, member use distribution, upstream multi-call actions, retries, and fixed platform fees. **Do not publish the candidate prices until measured economics support them.**

## Clear customer-facing differentiation

| Tier | Intended member | Currently launched coaches | Monthly AI allowance | Monthly price |
| --- | --- | --- | --- | --- |
| Starter | Occasional / price-sensitive | All available coaches + their tools | To calculate | To calculate |
| Standard | Regular coaching | Same | To calculate | To calculate |
| Plus | Frequent coaching | Same | To calculate | To calculate |
| Pro | High-volume coaching | Same | To calculate with cost ceiling | To calculate |

No tier locks someone out of a particular launched coach. Fitness and Budgeting tools should remain included in the same member experience, with manual-only budgeting and no account/bank connections. As Life and Career become available, stage their activation and entitlements explicitly rather than promising automatic access to unreleased functionality.

Keep each tier visibly different (at least roughly 2x the permitted coaching volume between adjacent levels as a **design starting point**, not a finalized entitlement) or four plans will create needless choice friction.

## Confirmed current baseline / non-interference

- Live site currently advertises $15/month with 400 shared AI uses and Fitness+Budgeting. That statement appears in the current homepage, subscription checkout copy, and Terms constants. Do not revise the live site while preparing tier pricing.
- Existing members keep their agreed price, access, paid-through cancellation, saved history, and ability to re-subscribe with the same login.
- The live website currently has one recurring $15 price wired to membership. The connected Stripe catalog also has older Basic / Growth / Pro and bundle products. "Active" Stripe catalog items are NOT proof that those are sold or should be reused.
- Never force a second subscription, downgrade, or new signup on a customer who has a valid paid membership.
- Preview only. No live Stripe catalog mutations, checkout changes, webhook changes, Pickaxe plan changes, public release, or production database writes for this plan.

## Technical finding: the allowance needs actual enforcement

The $15 / 400 allowance is present in the repository's marketing, Terms and Stripe pricing constants, but repository searches did not find a comprehensive cross-coach quota ledger. A read-only production Neon schema check found budget chat history tables and no table named like usage, meter, quota, or credits. These checks do not establish whether Pickaxe has provider-specific limits. **Do not assume a sitewide 400-message hard cap exists, or claim that each customer request costs the same.**

Priority 1 is an accurate, centralized and server-authoritative **shared AI usage meter**, independent of the coach selected.

For the user-facing definition, provisionally define one *AI use* as one member-initiated request that requires new AI generation. Server-side historical recall that requires only a database query and non-AI page views should not consume a use. Track each provider inference/tool invocation separately for operator cost accounting: one visible user message may invoke multiple model calls. Validate that the user-facing definition, reservation/refund behavior, and provider billing actually match before publication.

A shared use ledger must:
1. Key by stable Clerk user ID, approved subscription/entitlement version, and Stripe billing-period boundaries, not client-supplied emails, cookies, or "coach" names.
2. Use a unique idempotency key for each member request. Atomically reserve one use **before** an AI request, so concurrent requests cannot exceed quota. Replayed requests cannot charge multiple uses.
3. Finalize on successful generation; on a verified no-model failure, release the reservation; for timeouts/ambiguous upstream outcomes, reconcile safely to avoid both double charges and unlimited free retries.
4. Aggregate all eligible coach conversations into the same allowance; distinguish provider calls, tool calls and failed attempts in a separate cost ledger.
5. Prevent easy quota bypass by opening new conversations, using another coach, changing devices, cancel/re-subscribe, or opening a new tab.
6. Respect subscription lifecycle transitions: active, cancel-at-period-end, past_due/recoverable, lapse, reactivation, upgrade/downgrade and prorations. Never delete chats when a plan becomes inactive.
7. Avoid page-view charges: visiting My Budget or My Workouts, manual transactions, reading existing messages, and loading saved plans should not be billed as a new AI use (unless the action explicitly invokes AI).
8. Provide members a simple and accurate "uses remaining" number only after the system is reliable; never display Pickaxe workspace credits as if they were a particular member's allowance.
9. Keep user-private data out of general usage/cost logs; aggregate cost telemetry by opaque account and service IDs with retention safeguards.

## Pricing and gross-margin gate before assigning any numbers

We need a representative period of **actual** costs across Fitness, Budgeting, Life, and eventually Career:
- successful, failed, timed-out and retried user-initiated requests per coach;
- provider/completion calls per user request and average, median, 95th percentile cost;
- fixed platform/Pickaxe charges, including agent and monthly membership fees;
- Stripe processing and any usage-based platform fees;
- real engaged-member distribution (many customers will use far fewer than the maximum).

Do not guess the cost per message from a single low-cost Life Coach reply; Fitness workout generation and internal actions can be more expensive. A conservative member-cap contribution calculation is:

    allowable generation spend / month
      = tier price - expected billing fees - desired contribution margin - allocated fixed costs
    included AI-use cap <= allowable generation spend / conservative cost per *member-visible use*

The conservative cost per member-visible use must account for p95 expensive requests, not just a cheap model call. Alternatively set a transparent fair-use policy and separate guardrail for unusually expensive requests, but obtain clear owner consent and publish accurate terms before using such a policy.

**Do not sell unlimited AI use at this stage.** The precise Standard monthly price and cap are not approved, even though $15 / 400 is the current legacy member offer.

## Safe implementation order

1. Audit and instrument existing provider-request paths and separate Life Coach history retrieval from paid inference. Avoid new paid test calls.
2. Build and test the cross-coach meter in an **isolated Preview database** with fake members, simultaneous requests, billing-cycle rollovers, and idempotency/retry tests.
3. Estimate costs and propose the actual four rows of monthly prices and caps for owner approval; include a margin model and state how legacy members are protected.
4. Implement read-only plan selection and accurate member information before enabling actual tier checkout.
5. Only after approval, add verified Stripe price ID to member entitlement mapping, including migrations and grandfathering. Use test mode for trial purchases and plan transitions.
6. Confirm internal real second-account privacy test and complete Life Coach safety/quality gates, then stage production carefully.
7. Do not merge, publish pricing, enable billing, or change current customers without a separate explicit authorization.

## Decisions remaining

- Exact price/cap for Starter, Standard, Plus, Pro after provider cost evidence.
- Treatment of customers who remain at the original $15/400 plan versus future all-access plans.
- Definition of the counted "AI use" and whether premium requests consume more than one use.
- Introductory offers, auto-overage policy (recommend no automatic overage initially), and upgrade/downgrade rules.
- Timing for when Life and Career are included as **launched** coaches.

Owner preference: One membership, four simple usage tiers, all available coaches at each tier, no bundles. This supersedes the earlier nine-combination bundle design.