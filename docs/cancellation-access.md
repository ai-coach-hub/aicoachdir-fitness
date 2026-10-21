# Subscription management and cancellation

AI Coach Directory members manage renewal through the website, not a
Stripe-hosted, email-only portal login.

## Member journey

1. Go to `/manage-subscription`. Signed-out users see a primary **Member
   Login** button and an **Activate Existing Login** alternative for legacy
   Pickaxe members.
2. Member Login routes through `/fitness/login?destination=manage-subscription`,
   returning signed-in members to the subscription page instead of coach chat.
3. A member with a verified Clerk email and verified, linked Stripe
   subscription can cancel from the website. `POST /api/billing/cancel-renewal`
   checks the request origin and linked user, calls Stripe server-side with
   `cancel_at_period_end=true`, and verifies the resulting scheduled
   cancellation before confirming. The membership remains usable through
   the paid period.
4. The member can restore renewal before the period ends using the guarded
   `/api/billing/resume-renewal` path.
5. Updating a card or other payment details still uses an authenticated,
   short-lived Stripe billing portal session created server-side for the
   verified linked customer (not an emailed login link).

## Existing members who have no Clerk login

`/fitness/legacy-account` offers activation without creating an additional
paid subscription. Verified historical billing identities are reconciled
using the existing server-side checks. Do not treat an email address alone
as sufficient proof that a customer owns a particular billing subscription.

A signed-out customer can access the collapsed **Can't access your account
or subscription?** help section on `/manage-subscription`, which provides
a support email for cancellation requests. Support must confirm ownership
before changing billing. Do not request passwords or payment-card numbers.

## Guardrails

- Cancellation is not immediate; do not revoke access for an active paid
  member until their paid period expires.
- Do not create a checkout session merely because an existing subscription
  cannot be found by Clerk.
- Do not delete historical coaching data, user records, or Stripe customers
  to resolve a login mismatch.
- Anonymous visitors cannot pass email or a Stripe customer ID to generate
  billing access.
- `STRIPE_CUSTOMER_PORTAL_LOGIN_URL` and `lib/publicStripePortalLogin.ts`
  were retired after email-based portal login was rejected by the owner.
- Confirm both logged-out presentation and the verified linked-member UI
  during release validation. Do not trigger a live cancellation for testing
  without the member's express consent.

This does not alter webhooks, subscription checkout, or renewal pricing.
