import { NextResponse } from "next/server";
import {
  grantFitnessAccess,
  revokeFitnessAccess,
} from "@/lib/pickaxeAccess";
import { saveFitnessMembership } from "@/lib/fitnessMembershipDb";
import {
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
  const metadata = record(object.metadata);
  return string(metadata.member_email).trim().toLowerCase();
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
  if (args.active) {
    await grantFitnessAccess(args.email);
  } else {
    await revokeFitnessAccess(args.email);
  }

  await saveFitnessMembership({
    email: args.email,
    clerkUserId: args.clerkUserId || null,
    customerId: args.customerId || null,
    subscriptionId: args.subscriptionId || null,
    stripeStatus: args.status || null,
    active: args.active,
    eventType: args.eventType,
    eventId: args.eventId,
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  if (!verifyStripeWebhook(rawBody, signature)) {
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
    if (eventType === "checkout.session.completed") {
      const email =
        metadataEmail(object) ||
        string(record(object.customer_details).email).trim().toLowerCase();
      const subscriptionId = string(object.subscription);
      const customerId = string(object.customer);
      const clerkUserId = string(record(object.metadata).clerk_user_id);
      const paid = string(object.payment_status) === "paid";

      if (email && subscriptionId && paid) {
        await setAccess({
          email,
          active: true,
          customerId,
          subscriptionId,
          status: "active",
          clerkUserId,
          eventType,
          eventId,
        });
      }
    }

    if (
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.deleted"
    ) {
      const email = metadataEmail(object);
      const subscriptionId = string(object.id);
      const customerId = string(object.customer);
      const status = string(object.status);
      const clerkUserId = string(record(object.metadata).clerk_user_id);
      const active =
        eventType !== "customer.subscription.deleted" &&
        stripeSubscriptionIsActive(status);

      if (email && subscriptionId) {
        await setAccess({
          email,
          active,
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
