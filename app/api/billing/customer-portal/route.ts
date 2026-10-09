import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveMemberBillingCustomer } from "@/lib/memberBillingLookup";
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
  const email = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress
    || user?.emailAddresses[0]?.emailAddress || "";
  if (!user || !email) {
    return NextResponse.redirect(new URL("/fitness/login", siteOrigin), 303);
  }

  try {
    const billing = await resolveMemberBillingCustomer(email, user.id);
    if (billing.outcome !== "linked" || !/^cus_[a-zA-Z0-9_]+$/.test(billing.customerId)) {
      return NextResponse.redirect(new URL("/manage-subscription", siteOrigin), 303);
    }

    const form = new URLSearchParams();
    form.set("customer", billing.customerId);
    form.set("return_url", new URL("/manage-subscription", siteOrigin).toString());
    const session = await stripeRequest("/billing_portal/sessions", { method: "POST", body: form });
    const portalUrl = String(session.url || "");
    const parsed = new URL(portalUrl);
    if (parsed.protocol !== "https:" || !(parsed.hostname === "billing.stripe.com" || parsed.hostname.endsWith(".billing.stripe.com"))) {
      throw new Error("Unexpected billing portal host.");
    }
    return NextResponse.redirect(parsed, 303);
  } catch (error) {
    console.error("[billing-portal] failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.redirect(new URL("/manage-subscription?billing=unavailable", siteOrigin), 303);
  }
}
