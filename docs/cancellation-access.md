# Accessible membership cancellations

Subscriptions must remain cancelable even when a legacy member cannot log into Clerk.
This site offers two distinct paths:

1. An authenticated Clerk member can manage billing through the existing private
   Stripe portal session (`/manage-subscription` -> `/api/billing/customer-portal`).
2. A member without a working Clerk login can either use a **Stripe-hosted email
   verification login** (if activated) or request manual cancellation by emailing
   support from their billing address. Neither path requires a new paid account.

## Enable Stripe-hosted email sign-in for subscriptions

No Stripe connector needs to be granted to ChatGPT. The merchant must do this
in their own **live** Stripe Dashboard.

1. Open Stripe Billing > Customer portal. Enable the no-code/shareable portal login link.
2. Configure the portal to allow subscription cancellation at the **end of the paid
   billing period**, preserving service access until then.
3. Copy the *live* portal login URL, ordinarily
   `https://billing.stripe.com/p/login/...`.
4. Set `STRIPE_CUSTOMER_PORTAL_LOGIN_URL` to that exact URL for the Vercel
   **production** environment. Redeploy so that it is available.
5. On `https://www.aicoachdir.com/manage-subscription`, confirm the
   "Manage Billing by Email" button appears and reaches the correct merchant.
6. Validate using a consenting legacy customer's billing email and a new
   customer's billing email. Do not create test charges or use a third party's
   account without consent. Confirm cancellation is configured to stop renewal,
   rather than terminate paid access immediately.

If the URL is missing or invalid, the site does not display a broken portal link.
It always displays an email-support fallback instead.

## Why not look up Stripe accounts from a public email form?

The private Stripe billing portal route intentionally requires an authenticated,
verified Clerk user with a matching stored Stripe customer. Allowing an anonymous
caller to supply an email or customer ID would expose billing data and would risk
cancellation for the wrong account. Stripe's hosted login verifies email
ownership, while support must independently verify ownership before altering billing.

Stripe's shareable login may choose the most recently created active customer
if multiple Stripe customer records share an email. Customers who don't see
the correct subscription should contact support; do not pay again to fix it.

## Support handling

- Verify ownership from existing records; do not request passwords or card numbers.
- Cancel future renewal at end of paid period. Do not delete Clerk or Pickaxe
  accounts, existing coaching records, or Stripe customer objects.
- Confirm cancellation was scheduled and tell the customer the final paid-through
  date in a separate customer communication.
- For unusual legacy duplicate-customer or missing-email situations, research
  the specific account manually. Do not automatically merge subscriptions by
  email alone.

This configuration does not modify the authenticated billing API, subscription
renewal logic, or Stripe webhook processing.
