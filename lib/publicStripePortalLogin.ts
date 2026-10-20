/**
 * An optional no-code, customer-facing Stripe Billing portal login URL.
 * This URL is not a secret. Only accept Stripe's hosted email-login endpoint.
 * Never construct a portal session for an unauthenticated email address.
 */
export function getPublicStripePortalLoginUrl(): string {
  const configured = String(process.env.STRIPE_CUSTOMER_PORTAL_LOGIN_URL || "").trim();
  if (!configured) return "";

  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "billing.stripe.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !/^\/p\/login\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}
