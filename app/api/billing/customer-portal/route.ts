import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getFitnessMembership, memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import { linkVerifiedLegacyStripeMembership } from "@/lib/legacyStripeMembership";
import { stripeRequest } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originHeader = request.headers.get("origin");
  const siteOrigin = new URL(request.url).origin;
  if (!originHeader || originHeader !== siteOrigin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const user = await currentUser();
  const primaryAddress = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
    || user?.emailAddresses[0];
  const email = primaryAddress?.emailAddress || "";
  // A billing link is created only from a Clerk-verified email.
  const emailVerified = primaryAddress?.verification?.status === "verified";
  if (!user || !email) {
    return NextResponse.redirect(new URL("/fitness/login", siteOrigin), 303);
  }

  try {
    let membership = await getFitnessMembership(email);
    if (emailVerified && (!membership || (membership.access_active === true && String(membership.clerk_user_id || "") !== user.id))) {
      await memberHasFitnessAccess(email, user.id);
      membership = await getFitnessMembership(email);
    }
    if (emailVerified && membership?.access_active === true && !membership.stripe_customer_id) {
      membership = (await linkVerifiedLegacyStripeMembership(email, user.id)) || membership;
    }
    const customerId = String(membership?.stripe_customer_id || "");
    if (!customerId || !/^cus_[a-zA-Z0-9]+$/.test(customerId)) {
      return NextResponse.redirect(new URL("/manage-subscription", siteOrigin), 303);
    }
    const form = new URLSearchParams();
    form.set("customer", customerId);
    form.set("return_url", new URL("/manage-subscription", siteOrigin).toString());
    const session = await stripeRequest("/billing_portal/sessions", { method: "POST", body: form });
    const portalUrl = String(session.url || "");
    const parsed = new URL(portalUrl);
    if (parsed.protocol !== "https:" || !(parsed.hostname === "billing.stripe.com" || parsed.hostname.endsWith(".billing.stripe.com"))) {
      throw new Error("Unexpected billing portal host.");
    }
    return NextResponse.redirect(parsed, 303);
  } catch (error) {
    console.error("[billing-portal] failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.redirect(new URL("/manage-subscription?billing=unavailable", siteOrigin), 303);
  }
}
