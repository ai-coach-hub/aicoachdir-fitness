import { NextResponse } from "next/server";
import {
  grantFitnessAccess,
  revokeFitnessAccess,
} from "@/lib/pickaxeAccess";
import {
  getFitnessMembership,
  getFitnessMembershipBySubscriptionId,
  saveFitnessMembership,
} from "@/lib/fitnessMembershipDb";
import {
  stripeRequest,
  stripeSubscriptionIsActive,
  verifyStripeWebhook,
} from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeRecord = Record<string, unknown>;

function record(value: unknown): StripeRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as StripeRecord)
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function metadataEmail(object: StripeRecord) {
  return string(record(object.metadata).member_email).trim().toLowerCase();
}

async function setAccess(args: {
  email: string;
  active: boolean;
  customerId?: string;
  subscriptionId?: string;
  status?: string;
  clerkUserId?: string;
  eventType: string;
  eventId: string;
}) {
  // Events can arrive late or out of order. A terminated subscription
  // never gets to overwrite a DIFFERENT, newer subscription, even when the
  // current membership is temporarily inactive due to a failed payment.
  const current = await getFitnessMembership(args.email);
  const currentSubscriptionId = String(current?.stripe_subscription_id || "");
  if (
    currentSubscriptionId &&
    args.subscriptionId &&
    currentSubscriptionId !== args.subscriptionId
  ) {
    if (!args.active || current?.access_active === true) return;

    // A newer, verified paid Checkout may replace an older canceled record.
    // An old active webhook replay must not replace the newly linked record.
    const [oldSubscription, incomingSubscription] = await Promise.all([
      stripeRequest(`/subscriptions/${encodeURIComponent(currentSubscriptionId)}`),
      stripeRequest(`/subscriptions/${encodeURIComponent(args.subscriptionId)}`),
    ]);
    const oldCreated = Number(oldSubscription.created || 0);
    const incomingCreated = Number(incomingSubscription.created || 0);
    if (!oldCreated || !incomingCreated || incomingCreated <= oldCreated) return;
    if (String(incomingSubscription.customer || "") !== String(args.customerId || "")) {
      throw new Error("Incoming subscription/customer mismatch.");
    }
  }

  if (args.active) {
    // Stripe is the payment source of truth. Persist paid access first so a
    // temporary Pickaxe provisioning failure cannot send a paid member back
    // through checkout and risk a duplicate subscription.
    await saveFitnessMembership({
      email: args.email,
      clerkUserId: args.clerkUserId || null,
      customerId: args.customerId || null,
      subscriptionId: args.subscriptionId || null,
      stripeStatus: args.status || null,
      active: true,
      eventType: args.eventType,
      eventId: args.eventId,
    });

    await grantFitnessAccess(args.email);
    return;
  }

  // For revocation, remove downstream access first. If Pickaxe is temporarily
  // unavailable, Stripe will retry the webhook and local access remains
  // unchanged until downstream revocation succeeds.
  await revokeFitnessAccess(args.email);

  await saveFitnessMembership({
    email: args.email,
    clerkUserId: args.clerkUserId || null,
    customerId: args.customerId || null,
    subscriptionId: args.subscriptionId || null,
    stripeStatus: args.status || null,
    active: false,
    eventType: args.eventType,
    eventId: args.eventId,
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  const origin = new URL(request.url).origin;

  if (!(await verifyStripeWebhook(rawBody, signature, origin))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let event: StripeRecord;
  try {
    event = JSON.parse(rawBody) as StripeRecord;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventId = string(event.id);
  const eventType = string(event.type);
  const object = record(record(event.data).object);

  try {
    if (eventType === "checkout.session.completed" ||
        eventType === "checkout.session.async_payment_succeeded") {
      const email = metadataEmail(object);
      const subscriptionId = string(object.subscription);
      const customerId = string(object.customer);
      const clerkUserId = string(record(object.metadata).clerk_user_id);
      const paid = string(object.payment_status) === "paid";

      // Pickaxe's historical checkouts don't carry our Clerk identity metadata.
      // They must not silently create a new membership under a billing email.
      if (email && clerkUserId && subscriptionId && customerId && paid) {
        const current = record(await stripeRequest(
          `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        ));
        if (
          string(current.customer) === customerId &&
          stripeSubscriptionIsActive(current.status)
        ) {
          await setAccess({
            email,
            active: true,
            customerId,
            subscriptionId,
            status: string(current.status),
            clerkUserId,
            eventType,
            eventId,
          });
        }
      }
    }

    if (
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      const subscriptionId = string(object.id);
      const customerId = string(object.customer);
      let email = metadataEmail(object);
      let clerkUserId = string(record(object.metadata).clerk_user_id);

      // Old Pickaxe subscriptions have studioUserId metadata, not member_email.
      // Only an already verified subscription-to-member binding is permitted
      // to resolve the identity for a webhook without Clerk metadata.
      if (!email && subscriptionId && customerId) {
        const linked = await getFitnessMembershipBySubscriptionId(subscriptionId);
        if (linked && String(linked.stripe_customer_id || "") === customerId) {
          email = String(linked.email || "");
          clerkUserId = String(linked.clerk_user_id || "");
        }
      }

      if (email && subscriptionId && customerId) {
        // Stripe deliveries may arrive out of order. Read the current Stripe
        // status, including canceled-at-period-end subscriptions, before
        // granting or revoking someone's paid access.
        const current = record(await stripeRequest(
          `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        ));
        if (string(current.customer) !== customerId) {
          throw new Error("Stripe subscription/customer identity mismatch.");
        }
        const status = string(current.status);
        await setAccess({
          email,
          active: stripeSubscriptionIsActive(status),
          customerId,
          subscriptionId,
          status,
          clerkUserId,
          eventType,
          eventId,
        });
      }
    }
  } catch (error) {
    console.error("[fitness-billing-webhook] processing-failed", {
      eventId,
      eventType,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
