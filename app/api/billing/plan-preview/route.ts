import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getFitnessMembership } from "@/lib/fitnessMembershipDb";
import { stripeMode, stripeRequest } from "@/lib/stripeServer";
import { planSubscriptionChange } from "@/lib/subscriptionTransitionPolicy.mjs";
import { buildUpgradePreviewRequest, summarizeUpgradePreview } from "@/lib/subscriptionUpgradePreview.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
function fail(reason: string, status = 409) {
  return NextResponse.json({ ok: false, reason }, { status, headers: NO_STORE });
}
export async function POST(request: Request) {
  // Deliberately inaccessible in production. This must not create a subscription,
  // update an existing one, grant allowance or issue payment.
  if (process.env.VERCEL_ENV !== "preview" || stripeMode() !== "test" ||
      process.env.BILLING_PLAN_PREVIEW_ENABLED !== "true") {
    return fail("not_enabled", 404);
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("invalid_origin", 403);
  const user = await currentUser();
  const address = user?.emailAddresses.find(item => item.id === user.primaryEmailAddressId);
  if (!user || !address || address.verification?.status !== "verified") return fail("login_required", 401);
  const email = address.emailAddress.trim().toLowerCase();
  let targetTier: unknown;
  try {
    const body = await request.json();
    targetTier = body?.targetTier;
  } catch { return fail("invalid_request", 400); }
  if (typeof targetTier !== "string" || !["starter","growth","premium","elite"].includes(targetTier)) {
    return fail("invalid_tier", 400);
  }
  try {
    const member = await getFitnessMembership(email);
    if (!member || String(member.clerk_user_id || "") !== user.id) return fail("unlinked_member");
    const customerId = String(member.stripe_customer_id || "");
    const subscriptionId = String(member.stripe_subscription_id || "");
    if (!/^cus_[A-Za-z0-9]+$/.test(customerId) || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return fail("unlinked_member");
    const customer = await stripeRequest("/customers/" + encodeURIComponent(customerId));
    if (String(customer.email || "").trim().toLowerCase() !== email || customer.deleted === true) return fail("ownership_mismatch");
    const [subscription, listed] = await Promise.all([
      stripeRequest("/subscriptions/" + encodeURIComponent(subscriptionId)),
      stripeRequest("/subscriptions?" + new URLSearchParams({ customer: customerId, status: "all", limit: "100" })),
    ]);
    // Fail closed on incomplete subscription enumeration.
    if (listed.has_more === true || !Array.isArray(listed.data)) return fail("subscription_inventory_incomplete");
    const other = listed.data.filter((s: Record<string, unknown>) =>
      s.id !== subscriptionId && ["active","trialing","past_due","unpaid","incomplete","paused"].includes(String(s.status))).length;
    const approvedPriceIds = {
      starter: process.env.STRIPE_TIER_STARTER_PRICE_ID,
      growth: process.env.STRIPE_TIER_GROWTH_PRICE_ID,
      premium: process.env.STRIPE_TIER_PREMIUM_PRICE_ID,
      elite: process.env.STRIPE_TIER_ELITE_PRICE_ID,
    };
    const plan = planSubscriptionChange({
      verifiedClerkUserId: user.id,
      linkedClerkUserId: String(member.clerk_user_id || ""),
      verifiedCustomerId: customerId,
      linkedSubscriptionId: subscriptionId,
      subscription, targetTier, otherActiveSubscriptionCount: other, approvedPriceIds,
      // Preview only becomes available after the verified shared allowance gate.
      sharedAllowanceReady: process.env.BILLING_SHARED_ALLOWANCE_QA_VERIFIED === "true",
    });
    if (!plan.ok) return fail(plan.reason);
    if (plan.action !== "upgrade") return fail("upgrade_quote_only");
    const periodEnd = Number(subscription.items?.data?.[0]?.current_period_end);
    const at = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(periodEnd) || at >= periodEnd) return fail("invalid_billing_period");
    const quoteForm = buildUpgradePreviewRequest(plan, at);
    const preview = await stripeRequest("/invoices/create_preview", { method: "POST", body: quoteForm });
    const quote = summarizeUpgradePreview(preview);
    return NextResponse.json({
      ok: true, fromTier: plan.currentTier, toTier: plan.targetTier,
      ...quote, estimateOnly: true, chargeInitiated: false,
    }, { headers: NO_STORE });
  } catch (error) {
    console.error("[billing-plan-preview] unavailable", error instanceof Error ? error.message : "unknown");
    return fail("quote_unavailable", 503);
  }
}
