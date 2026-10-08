import { currentUser } from "@clerk/nextjs/server";
import { getFitnessMembership } from "@/lib/fitnessMembershipDb";
import { stripeConfigured, stripeRequest } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opens Stripe's customer portal so a member can cancel or update billing online. A cancellation made
// there (portal set to cancel at the end of the billing period) raises customer.subscription.updated and,
// when the period ends, customer.subscription.deleted, which app/api/billing/webhook already turns into
// the end of access. Anything that stops the portal opening sends the member back to /fitness/membership,
// which always shows the email fallback.

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

function redirectTo(location: string) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const unavailable = new URL("/fitness/membership?portal=unavailable", request.url).toString();
  const user = await currentUser();
  const email = primaryEmail(user);
  if (!user || !email) return redirectTo(new URL("/fitness/login", request.url).toString());

  try {
    const membership = await getFitnessMembership(email);
    const customer = String(membership?.stripe_customer_id || "");
    if (!customer || !stripeConfigured()) return redirectTo(unavailable);

    const body = new URLSearchParams();
    body.set("customer", customer);
    body.set("return_url", new URL("/fitness/membership", request.url).toString());
    const session = await stripeRequest("/billing_portal/sessions", { method: "POST", body });
    const url = typeof session.url === "string" ? session.url : "";
    if (!url.startsWith("https://")) return redirectTo(unavailable);
    return redirectTo(url);
  } catch {
    // Intentionally avoid logging request data, customer identifiers or Stripe errors.
    console.error("Billing portal session could not be created.");
    return redirectTo(unavailable);
  }
}
