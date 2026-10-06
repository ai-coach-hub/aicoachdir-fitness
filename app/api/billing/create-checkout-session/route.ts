import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureTermsAcceptanceSchema } from "@/lib/termsAcceptanceDb";
import { memberHasFitnessAccess } from "@/lib/fitnessMembershipDb";
import {
  ensureStripeBillingResources,
  stripeConfigured,
  stripeRequest,
} from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMS_COOKIE = "fitness_terms_acceptance";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) return "";
  const primary = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return (primary?.emailAddress || user.emailAddresses[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  let requestedDestination = "fitness";
  try {
    const payload = (await request.json()) as { destination?: unknown };
    if (payload?.destination === "budget-coach") requestedDestination = "budget-coach";
  } catch {
    // Default to Fitness when no destination was supplied.
  }

  const destinationUrl = requestedDestination === "budget-coach"
    ? "/budgeting/launch?destination=coach"
    : "/fitness/chat";
  const destinationQuery = requestedDestination === "budget-coach"
    ? "budget-coach"
    : "fitness";

  const user = await currentUser();
  const email = primaryEmail(user);

  if (!user || !email) {
    return NextResponse.json(
      { ok: false, error: "Sign in is required." },
      { status: 401 },
    );
  }

  try {
    if (
      await memberHasFitnessAccess(email, user.id, {
        fallbackToPickaxeList: false,
      })
    ) {
      return NextResponse.json({ ok: true, alreadyActive: true, url: destinationUrl });
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "We could not verify your current AI Coach Directory membership. No charge was attempted.",
      },
      { status: 503 },
    );
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Secure checkout is waiting for the server-side Stripe key. No charge was attempted.",
      },
      { status: 503 },
    );
  }

  const cookieStore = await cookies();
  const acceptanceId = cookieStore.get(TERMS_COOKIE)?.value || "";

  if (!UUID_PATTERN.test(acceptanceId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please review and accept the Terms before subscribing.",
        actionUrl: `/fitness/signup?destination=${destinationQuery}`,
        actionLabel: "Review & Accept Terms",
      },
      { status: 409 },
    );
  }

  const sql = await ensureTermsAcceptanceSchema();
  const rows = await sql`
    SELECT email
    FROM terms_acceptances
    WHERE id = ${acceptanceId}::uuid
      AND accepted_at >= NOW() - INTERVAL '1 hour'
    LIMIT 1
  `;

  const acceptedEmail = String(rows[0]?.email || "").trim().toLowerCase();
  if (!acceptedEmail || acceptedEmail !== email) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Your signed-in email must match the email used for Terms acceptance.",
        actionUrl: `/fitness/signup?destination=${destinationQuery}`,
        actionLabel: "Review Terms with This Account",
      },
      { status: 409 },
    );
  }

  const origin = new URL(request.url).origin;

  try {
    const { priceId } = await ensureStripeBillingResources(origin);

    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    body.set("customer_email", email);
    body.set("client_reference_id", user.id);
    body.set("success_url", `${origin}/fitness/checkout/success?session_id={CHECKOUT_SESSION_ID}&destination=${destinationQuery}`);
    body.set("cancel_url", `${origin}/fitness/subscribe?destination=${destinationQuery}`);
    body.set("metadata[member_email]", email);
    body.set("metadata[clerk_user_id]", user.id);
    body.set("metadata[terms_acceptance_id]", acceptanceId);
    body.set("subscription_data[metadata][member_email]", email);
    body.set("subscription_data[metadata][clerk_user_id]", user.id);
    body.set("subscription_data[metadata][terms_acceptance_id]", acceptanceId);

    const session = await stripeRequest("/checkout/sessions", {
      method: "POST",
      body,
    });

    const url = String(session.url || "");
    if (!url.startsWith("https://")) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return NextResponse.json(
      { ok: true, alreadyActive: false, url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[fitness-checkout] create-failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Secure checkout could not be started. No charge was attempted.",
      },
      { status: 502 },
    );
  }
}
